import { revalidateTag, unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";

import {
  ensureDatabaseConnected,
  getSettingsId,
  isDatabaseUnavailable,
} from "@/lib/database";
import { stackOptions } from "@/lib/job-applications";
import { defaultPermissionMatrix } from "@/lib/permission-config";
import { prisma } from "@/lib/prisma";

const jobApplicationStacksTag = "job-application-stacks";

const getCachedJobApplicationStackOptions = unstable_cache(
  async (): Promise<string[]> => {
    try {
      await ensureDatabaseConnected();

      const settings = await prisma.appSettings.findUnique({
        where: { id: getSettingsId() },
        select: { permissionMatrix: true },
      });

      const parsed =
        settings?.permissionMatrix &&
        typeof settings.permissionMatrix === "object" &&
        !Array.isArray(settings.permissionMatrix)
          ? (settings.permissionMatrix as Record<string, unknown>)
          : null;

      return parseStoredStacks(parsed?.jobApplicationStacks);
    } catch (error) {
      if (!isDatabaseUnavailable(error)) {
        throw error;
      }

      return [...stackOptions];
    }
  },
  ["job-application-stacks"],
  { tags: [jobApplicationStacksTag] },
);

export async function getJobApplicationStackOptions() {
  return getCachedJobApplicationStackOptions();
}

export async function setJobApplicationStackOptions(values: string[]) {
  const sanitized = sanitizeStacks(values);

  await ensureDatabaseConnected();

  const settings = await prisma.appSettings.upsert({
    where: { id: getSettingsId() },
    update: {},
    create: {
      id: getSettingsId(),
      permissionMatrix: defaultPermissionMatrix,
    },
    select: { permissionMatrix: true },
  });

  const parsed =
    settings.permissionMatrix &&
    typeof settings.permissionMatrix === "object" &&
    !Array.isArray(settings.permissionMatrix)
      ? (settings.permissionMatrix as Record<string, unknown>)
      : {};

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "AppSettings"
      SET
        "permissionMatrix" = ${JSON.stringify({
          ...parsed,
          jobApplicationStacks: sanitized,
        })}::jsonb,
        "updatedAt" = NOW()
      WHERE "id" = ${getSettingsId()}
    `,
  );

  revalidateTag(jobApplicationStacksTag);

  return sanitized;
}

function parseStoredStacks(value: unknown) {
  if (value == null) {
    return [...stackOptions];
  }

  if (!Array.isArray(value)) {
    return [...stackOptions];
  }

  return sanitizeStacks(value);
}

function sanitizeStacks(values: unknown[]) {
  const unique = new Map<string, string>();

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim();

    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();

    if (!unique.has(key)) {
      unique.set(key, normalized);
    }
  }

  return Array.from(unique.values()).sort((left, right) =>
    left.localeCompare(right),
  );
}
