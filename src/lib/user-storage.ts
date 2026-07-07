import { unstable_cache } from "next/cache";
import { Role as PrismaRole } from "@prisma/client";

import { ensureDatabaseConnected } from "@/lib/database";
import { hashPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { resolveSessionLocationName } from "@/lib/session-location";
import type { ManagedSession, ManagedUser, Role } from "@/lib/types";

async function mapSession(session: {
  id: string;
  ipAddress: string | null;
  osInfo: string | null;
  createdAt: Date;
  expiresAt: Date;
}): ManagedSession {
  const ipAddress = session.ipAddress ?? "";

  return {
    id: session.id,
    ipAddress,
    locationName: await resolveSessionLocationName(ipAddress),
    deviceInfo: session.osInfo ?? "",
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  };
}

const getCachedUsers = unstable_cache(
  async (): Promise<ManagedUser[]> => {
  await ensureDatabaseConnected();

  const users = await prisma.user.findMany({
    include: {
      sessions: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return Promise.all(
    users.map(async (user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      password: "",
      sessions: await Promise.all(user.sessions.map(mapSession)),
      bidderAppliedRate: user.bidderAppliedRate,
      bidderFailedRate: user.bidderFailedRate,
      callerHourlyRate: user.callerHourlyRate,
    })),
  );
  },
  ["users"],
  { tags: ["users"] },
);

const getCachedUsersBasic = unstable_cache(
  async (): Promise<ManagedUser[]> => {
    await ensureDatabaseConnected();

    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      password: "",
      sessions: [],
      bidderAppliedRate: user.bidderAppliedRate,
      bidderFailedRate: user.bidderFailedRate,
      callerHourlyRate: user.callerHourlyRate,
    }));
  },
  ["users-basic"],
  { tags: ["users"] },
);

export async function getUsers(): Promise<ManagedUser[]> {
  return getCachedUsers();
}

export async function getUsersBasic(): Promise<ManagedUser[]> {
  return getCachedUsersBasic();
}

export async function getUserById(id: string) {
  await ensureDatabaseConnected();

  const user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    password: "",
    sessions: [],
    bidderAppliedRate: user.bidderAppliedRate,
    bidderFailedRate: user.bidderFailedRate,
    callerHourlyRate: user.callerHourlyRate,
  } satisfies ManagedUser;
}

export async function getUsersByRole(role: Role) {
  await ensureDatabaseConnected();

  const users = await prisma.user.findMany({
    where: { role: role as PrismaRole },
    orderBy: { name: "asc" },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    password: "",
    sessions: [],
    bidderAppliedRate: user.bidderAppliedRate,
    bidderFailedRate: user.bidderFailedRate,
    callerHourlyRate: user.callerHourlyRate,
  }));
}

export async function createUser(user: {
  id?: string;
  name: string;
  email: string;
  password: string;
  role: Role;
}) {
  await ensureDatabaseConnected();

  return prisma.user.create({
    data: {
      id: user.id,
      name: user.name,
      email: user.email.toLowerCase(),
      passwordHash: hashPassword(user.password),
      role: user.role as PrismaRole,
    },
  });
}

export async function updateUser(
  id: string,
  user: {
    name: string;
    email: string;
    password?: string;
    role: Role;
    bidderAppliedRate?: number;
    bidderFailedRate?: number;
    callerHourlyRate?: number;
  },
) {
  await ensureDatabaseConnected();

  return prisma.user.update({
    where: { id },
    data: {
      name: user.name,
      email: user.email.toLowerCase(),
      role: user.role as PrismaRole,
      bidderAppliedRate:
        user.role === "bidder" ? sanitizeRate(user.bidderAppliedRate) : 0,
      bidderFailedRate:
        user.role === "bidder" ? sanitizeRate(user.bidderFailedRate) : 0,
      callerHourlyRate:
        user.role === "caller" ? sanitizeRate(user.callerHourlyRate) : 0,
      ...(user.password ? { passwordHash: hashPassword(user.password) } : {}),
    },
  });
}

export async function deleteUser(id: string) {
  await ensureDatabaseConnected();
  return prisma.user.delete({ where: { id } });
}

export async function revokeUserSessions(userId: string) {
  await ensureDatabaseConnected();
  return prisma.session.deleteMany({ where: { userId } });
}

export async function revokeSession(sessionId: string) {
  await ensureDatabaseConnected();
  return prisma.session.deleteMany({ where: { id: sessionId } });
}

function sanitizeRate(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return Math.round(numeric * 100) / 100;
}
