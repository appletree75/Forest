import { cookies, headers } from "next/headers";
import { revalidateTag } from "next/cache";
import { cache } from "react";
import { Prisma } from "@prisma/client";

import { createAuditLog } from "@/lib/audit-log";
import { addHours } from "@/lib/dates";
import {
  createSessionToken,
  ensureDatabaseConnected,
  isDatabaseUnavailable,
} from "@/lib/database";
import {
  clearLoginRateLimit,
  getLoginRateLimitKey,
  getLoginRateLimitStatus,
  pruneExpiredLoginRateLimits,
  recordFailedLoginAttempt,
} from "@/lib/login-rate-limit";
import { verifyPassword } from "@/lib/passwords";
import { defaultPermissionMatrix } from "@/lib/permission-config";
import { prisma } from "@/lib/prisma";
import { getPermissionMatrix, getRolePermissions } from "@/lib/permissions";
import type { PermissionKey, SessionUser } from "@/lib/types";

const sessionCookieKey = "nex_session";
type SessionCookiePayload = {
  token: string;
  user: SessionUser;
  permissions?: PermissionKey[];
};
type SessionRecord = {
  user: {
    id: string;
    name: string;
    email: string;
    role: SessionUser["role"];
  };
  expiresAt: Date;
};

export const getSessionState = cache(
  async (): Promise<{ user: SessionUser | null; permissions: PermissionKey[] }> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(sessionCookieKey)?.value;

  if (!raw) {
    return { user: null, permissions: [] };
  }

  const cookiePayload = parseSessionCookie(raw);
  const token = cookiePayload?.token ?? raw;

  let session: SessionRecord | null = null;

  try {
    await ensureDatabaseConnected();
    session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    if (cookiePayload?.user) {
      return {
        user: cookiePayload.user,
        permissions:
          cookiePayload.permissions ??
          getRolePermissions(defaultPermissionMatrix, cookiePayload.user.role),
      };
    }

    return { user: null, permissions: [] };
  }

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.session.delete({ where: { token } });
    }
    return { user: null, permissions: [] };
  }

  const user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
  };
  const matrix = await getPermissionMatrix();
  const permissions = getRolePermissions(matrix, user.role);

  return { user, permissions };
});

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const state = await getSessionState();
  return state.user;
});

export async function signIn(email: string, password: string) {
  try {
    await ensureDatabaseConnected();
    await pruneExpiredLoginRateLimits();
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return {
      ok: false as const,
      message: "Database is temporarily unavailable. Please try again.",
    };
  }

  const normalizedEmail = email.toLowerCase().trim();
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const realIp = requestHeaders.get("x-real-ip");
  const ipAddress = getClientIpAddress(forwardedFor, realIp);
  const rateLimitKey = getLoginRateLimitKey(normalizedEmail, ipAddress);
  const rateLimitStatus = await getLoginRateLimitStatus(rateLimitKey);

  if (rateLimitStatus.blocked) {
    await createAuditLog({
      actorEmail: normalizedEmail,
      action: "auth.login_blocked",
      targetType: "session",
      targetLabel: normalizedEmail,
      ipAddress,
    });
    return {
      ok: false as const,
      message: "Too many login attempts. Try again later.",
    };
  }

  let matchedUser: Awaited<ReturnType<typeof prisma.user.findUnique>> = null;

  try {
    matchedUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return {
      ok: false as const,
      message: "Database is temporarily unavailable. Please try again.",
    };
  }

  if (!matchedUser || !verifyPassword(password, matchedUser.passwordHash)) {
    await recordFailedLoginAttempt(rateLimitKey, normalizedEmail, ipAddress);
    await createAuditLog({
      actorEmail: normalizedEmail,
      action: "auth.login_failed",
      targetType: "session",
      targetLabel: normalizedEmail,
      ipAddress,
    });
    return {
      ok: false as const,
      message: "Invalid email or password.",
    };
  }

  const token = createSessionToken();
  const matrix = await getPermissionMatrix();
  const permissions = getRolePermissions(matrix, matchedUser.role);
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const osInfo = getDeviceInfoFromUserAgent(userAgent);
  const expiresAt = addHours(new Date(), 12);

  try {
    await prisma.session.create({
      data: {
        token,
        userId: matchedUser.id,
        ipAddress,
        osInfo,
        expiresAt,
      },
    });
  } catch (error) {
    if (!isSessionMetadataSchemaMismatch(error)) {
      throw error;
    }

    await prisma.session.create({
      data: {
        token,
        userId: matchedUser.id,
        expiresAt,
      },
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(
    sessionCookieKey,
    JSON.stringify({
      token,
      user: {
        id: matchedUser.id,
        name: matchedUser.name,
        email: matchedUser.email,
        role: matchedUser.role,
      },
      permissions,
    } satisfies SessionCookiePayload),
    {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
    },
  );

  await clearLoginRateLimit(rateLimitKey);
  await createAuditLog({
    actorUserId: matchedUser.id,
    actorEmail: matchedUser.email,
    action: "auth.login_succeeded",
    targetType: "session",
    targetId: token,
    targetLabel: matchedUser.email,
    ipAddress,
  });
  revalidateTag("users");

  return {
    ok: true as const,
  };
}

export async function signOut() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(sessionCookieKey)?.value;
  const token = raw ? (parseSessionCookie(raw)?.token ?? raw) : "";
  const sessionUser = await getSessionUser();

  if (token) {
    await ensureDatabaseConnected();
    await prisma.session.deleteMany({ where: { token } });
  }

  await createAuditLog({
    actorUserId: sessionUser?.id,
    actorEmail: sessionUser?.email,
    action: "auth.logout",
    targetType: "session",
    targetId: token,
    targetLabel: sessionUser?.email,
  });
  cookieStore.delete(sessionCookieKey);
  revalidateTag("users");
}

export async function requireSession() {
  const user = await getSessionUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

function parseSessionCookie(value: string) {
  try {
    return JSON.parse(value) as SessionCookiePayload;
  } catch {
    return null;
  }
}

function getClientIpAddress(
  forwardedFor: string | null,
  realIp: string | null,
) {
  const candidate = forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || "";
  return candidate;
}

function getDeviceInfoFromUserAgent(userAgent: string) {
  const normalized = userAgent.toLowerCase();

  if (!normalized) {
    return "";
  }

  const os = getOsNameAndVersion(userAgent);
  const browser = getBrowserNameAndVersion(userAgent);

  if (os && browser) {
    return `${os} · ${browser}`;
  }

  return os || browser || "Unknown";
}

function getOsNameAndVersion(userAgent: string) {
  const windowsMatch = userAgent.match(/Windows NT ([0-9.]+)/i);

  if (windowsMatch) {
    const windowsVersionMap: Record<string, string> = {
      "10.0": "Windows 10/11",
      "6.3": "Windows 8.1",
      "6.2": "Windows 8",
      "6.1": "Windows 7",
    };
    const version = windowsVersionMap[windowsMatch[1]] ?? `Windows NT ${windowsMatch[1]}`;
    return version;
  }

  const androidMatch = userAgent.match(/Android ([0-9.]+)/i);

  if (androidMatch) {
    return `Android ${androidMatch[1]}`;
  }

  const iosMatch = userAgent.match(/OS ([0-9_]+) like Mac OS X/i);

  if (iosMatch) {
    return `iOS ${iosMatch[1].replaceAll("_", ".")}`;
  }

  const macMatch = userAgent.match(/Mac OS X ([0-9_]+)/i);

  if (macMatch) {
    return `macOS ${macMatch[1].replaceAll("_", ".")}`;
  }

  const chromeOsMatch = userAgent.match(/CrOS [^ ]+ ([0-9.]+)/i);

  if (chromeOsMatch) {
    return `ChromeOS ${chromeOsMatch[1]}`;
  }

  if (userAgent.match(/Linux/i)) {
    return "Linux";
  }

  return "";
}

function getBrowserNameAndVersion(userAgent: string) {
  const edgeMatch = userAgent.match(/Edg\/([0-9.]+)/i);

  if (edgeMatch) {
    return `Edge ${edgeMatch[1]}`;
  }

  const chromeMatch = userAgent.match(/Chrome\/([0-9.]+)/i);

  if (chromeMatch) {
    return `Chrome ${chromeMatch[1]}`;
  }

  const firefoxMatch = userAgent.match(/Firefox\/([0-9.]+)/i);

  if (firefoxMatch) {
    return `Firefox ${firefoxMatch[1]}`;
  }

  const safariMatch = userAgent.match(/Version\/([0-9.]+).*Safari/i);

  if (safariMatch) {
    return `Safari ${safariMatch[1]}`;
  }

  return "";
}

function isSessionMetadataSchemaMismatch(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientValidationError &&
    (error.message.includes("Unknown argument `ipAddress`") ||
      error.message.includes("Unknown argument `osInfo`"))
  );
}
