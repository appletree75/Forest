import { revalidateTag, unstable_cache } from "next/cache";

import {
  ensureDatabaseConnected,
  isDatabaseUnavailable,
} from "@/lib/database";
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

export type BlockedLoginRateLimitEntry = {
  key: string;
  email: string;
  ipAddress: string;
  failedCount: number;
  firstAttemptAt: string;
  blockedUntil: string;
  updatedAt: string;
};

const getCachedBlockedLoginRateLimits = unstable_cache(
  async (): Promise<BlockedLoginRateLimitEntry[]> => {
    try {
      await ensureDatabaseConnected();
      const now = new Date();
      const rows = await prisma.loginRateLimit.findMany({
        where: {
          blockedUntil: {
            gt: now,
          },
        },
        orderBy: {
          blockedUntil: "desc",
        },
      });

      return rows.map((row) => ({
        key: row.key,
        email: row.email,
        ipAddress: row.ipAddress,
        failedCount: row.failedCount,
        firstAttemptAt: row.firstAttemptAt.toISOString(),
        blockedUntil: row.blockedUntil?.toISOString() ?? "",
        updatedAt: row.updatedAt.toISOString(),
      }));
    } catch (error) {
      if (!isDatabaseUnavailable(error)) {
        throw error;
      }

      return [];
    }
  },
  ["blocked-login-rate-limits"],
  { tags: ["login-rate-limit"] },
);

export function getLoginRateLimitKey(email: string, ipAddress: string) {
  return `${email.trim().toLowerCase()}::${ipAddress.trim() || "unknown"}`;
}

export async function getLoginRateLimitStatus(key: string) {
  try {
    await ensureDatabaseConnected();
    const now = new Date();
    const record = await prisma.loginRateLimit.findUnique({
      where: { key },
    });

    if (!record) {
      return { blocked: false, retryAfterMs: 0 };
    }

    if (record.blockedUntil && record.blockedUntil > now) {
      return {
        blocked: true,
        retryAfterMs: record.blockedUntil.getTime() - now.getTime(),
      };
    }

    if (now.getTime() - record.firstAttemptAt.getTime() > WINDOW_MS) {
      await prisma.loginRateLimit.deleteMany({
        where: { key },
      });
      return { blocked: false, retryAfterMs: 0 };
    }

    return { blocked: false, retryAfterMs: 0 };
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return { blocked: false, retryAfterMs: 0 };
  }
}

export async function recordFailedLoginAttempt(
  key: string,
  email: string,
  ipAddress: string,
) {
  try {
    await ensureDatabaseConnected();
    const now = new Date();
    const record = await prisma.loginRateLimit.findUnique({
      where: { key },
    });

    if (!record || now.getTime() - record.firstAttemptAt.getTime() > WINDOW_MS) {
      await prisma.loginRateLimit.upsert({
        where: { key },
        update: {
          email,
          ipAddress,
          failedCount: 1,
          firstAttemptAt: now,
          blockedUntil: null,
        },
        create: {
          key,
          email,
          ipAddress,
          failedCount: 1,
          firstAttemptAt: now,
        },
      });
      revalidateTag("login-rate-limit");
      return;
    }

    const failedCount = record.failedCount + 1;
    await prisma.loginRateLimit.update({
      where: { key },
      data: {
        email,
        ipAddress,
        failedCount,
        blockedUntil:
          failedCount >= MAX_FAILED_ATTEMPTS
            ? new Date(now.getTime() + BLOCK_MS)
            : null,
      },
    });
    revalidateTag("login-rate-limit");
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }
  }
}

export async function clearLoginRateLimit(key: string) {
  try {
    await ensureDatabaseConnected();
    await prisma.loginRateLimit.deleteMany({
      where: { key },
    });
    revalidateTag("login-rate-limit");
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }
  }
}

export async function pruneExpiredLoginRateLimits() {
  try {
    await ensureDatabaseConnected();
    const cutoff = new Date(Date.now() - WINDOW_MS);
    const result = await prisma.loginRateLimit.deleteMany({
      where: {
        OR: [
          { updatedAt: { lt: cutoff } },
          { blockedUntil: { lt: new Date() } },
        ],
      },
    });

    return result.count;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return 0;
  }
}

export async function getBlockedLoginRateLimits() {
  await pruneExpiredLoginRateLimits();
  return getCachedBlockedLoginRateLimits();
}

export async function clearAllBlockedLoginRateLimits() {
  try {
    await ensureDatabaseConnected();
    await prisma.loginRateLimit.deleteMany({});
    revalidateTag("login-rate-limit");
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }
  }
}
