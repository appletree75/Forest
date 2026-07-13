import { unstable_cache } from "next/cache";
import { Role as PrismaRole } from "@prisma/client";

import {
  ensureDatabaseConnected,
  isDatabaseUnavailable,
} from "@/lib/database";
import { prisma } from "@/lib/prisma";
import type { SalarySettings } from "@/lib/types";

const getCachedSalarySettings = unstable_cache(
  async (): Promise<SalarySettings> => {
    try {
      await ensureDatabaseConnected();

      const users = await prisma.user.findMany({
        where: {
          role: {
            in: [PrismaRole.bidder, PrismaRole.caller],
          },
        },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          bidderAppliedRate: true,
          bidderFailedRate: true,
          callerHourlyRate: true,
        },
      });

      return {
        bidders: users
          .filter((user) => user.role === PrismaRole.bidder)
          .map((user) => ({
            userId: user.id,
            name: user.name,
            email: user.email,
            bidderAppliedRate: sanitizeRate(user.bidderAppliedRate),
            bidderFailedRate: sanitizeRate(user.bidderFailedRate),
          })),
        callers: users
          .filter((user) => user.role === PrismaRole.caller)
          .map((user) => ({
            userId: user.id,
            name: user.name,
            email: user.email,
            callerHourlyRate: sanitizeRate(user.callerHourlyRate),
          })),
      };
    } catch (error) {
      if (!isDatabaseUnavailable(error)) {
        throw error;
      }

      return {
        bidders: [],
        callers: [],
      };
    }
  },
  ["salary-settings"],
  { tags: ["salary-settings"] },
);

export async function getSalarySettings() {
  return getCachedSalarySettings();
}

function sanitizeRate(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return Math.round(numeric * 100) / 100;
}
