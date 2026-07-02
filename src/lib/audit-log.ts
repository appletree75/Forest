import { Prisma } from "@prisma/client";
import { revalidateTag, unstable_cache } from "next/cache";

import { ensureDatabaseConnected } from "@/lib/database";
import { prisma } from "@/lib/prisma";

export type AuditLogEntry = {
  id: string;
  actorUserId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  metadata: string;
  ipAddress: string;
  createdAt: string;
};

type CreateAuditLogInput = {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

const getCachedRecentAuditLogs = unstable_cache(
  async (): Promise<AuditLogEntry[]> => {
    await ensureDatabaseConnected();

    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
    });

    return rows.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId ?? "",
      actorEmail: row.actorEmail ?? "",
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId ?? "",
      targetLabel: row.targetLabel ?? "",
      metadata: row.metadata ? JSON.stringify(row.metadata) : "",
      ipAddress: row.ipAddress ?? "",
      createdAt: row.createdAt.toISOString(),
    }));
  },
  ["audit-log-recent"],
  { tags: ["audit-log"] },
);

export async function getRecentAuditLogs() {
  return getCachedRecentAuditLogs();
}

export async function createAuditLog(input: CreateAuditLogInput) {
  try {
    await ensureDatabaseConnected();
    await prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        targetLabel: input.targetLabel ?? null,
        metadata: input.metadata
          ? (input.metadata as Prisma.InputJsonValue)
          : undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
    revalidateTag("audit-log");
  } catch {
    return;
  }
}
