import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureDatabaseConnected, getSettingsId } from "@/lib/database";
import { defaultPermissionMatrix } from "@/lib/permission-config";

type AppSettingsRow = {
  permissionMatrix: unknown;
  jobApplicationStacks: unknown;
  financePasswordHash: string | null;
};

type AppSettingsQueryRow = {
  permissionMatrix: unknown;
  jobApplicationStacks?: unknown;
  financePasswordHash?: string | null;
};

export async function ensureAppSettingsRow() {
  await ensureDatabaseConnected();

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "AppSettings" ("id", "permissionMatrix", "createdAt", "updatedAt")
      VALUES (
        ${getSettingsId()},
        ${JSON.stringify(defaultPermissionMatrix)}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT ("id") DO NOTHING
    `,
  );
}

export async function getAppSettingsRow(): Promise<AppSettingsRow> {
  await ensureAppSettingsRow();

  const availableColumns = await getAppSettingsColumns();
  let row = (await readAppSettingsRow(availableColumns))[0];

  if (
    row &&
    (!row.permissionMatrix ||
      typeof row.permissionMatrix !== "object" ||
      !("supportorInterviewDefaultApplied" in row.permissionMatrix))
  ) {
    await applySupportorInterviewDefault();
    row = (await readAppSettingsRow(availableColumns))[0];
  }

  if (!row) {
      return {
        permissionMatrix: defaultPermissionMatrix,
        jobApplicationStacks: null,
        financePasswordHash: null,
      };
    }

  return {
    permissionMatrix: row.permissionMatrix,
    jobApplicationStacks: row.jobApplicationStacks ?? null,
    financePasswordHash: row.financePasswordHash ?? null,
  };
}

export async function updateAppSettingsPermissionMatrix(
  permissionMatrix: Record<string, unknown>,
) {
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "AppSettings" ("id", "permissionMatrix", "createdAt", "updatedAt")
      VALUES (
        ${getSettingsId()},
        ${JSON.stringify({ ...permissionMatrix, supportorInterviewDefaultApplied: true })}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT ("id") DO UPDATE
      SET
        "permissionMatrix" = EXCLUDED."permissionMatrix",
        "updatedAt" = NOW()
    `,
  );
}

async function applySupportorInterviewDefault() {
  // Upgrade legacy rows once; later admin changes carry the marker and are left alone.
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "AppSettings"
      SET
        "permissionMatrix" = jsonb_set(
          jsonb_set(
            "permissionMatrix",
            '{supportor}',
            CASE
              WHEN jsonb_typeof("permissionMatrix"->'supportor') = 'array' THEN
                CASE
                  WHEN "permissionMatrix"->'supportor' @> '["view_interview"]'::jsonb
                    THEN "permissionMatrix"->'supportor'
                  ELSE "permissionMatrix"->'supportor' || '["view_interview"]'::jsonb
                END
              ELSE ${JSON.stringify(defaultPermissionMatrix.supportor)}::jsonb
            END,
            true
          ),
          '{supportorInterviewDefaultApplied}',
          'true'::jsonb,
          true
        ),
        "updatedAt" = NOW()
      WHERE "id" = ${getSettingsId()}
        AND NOT ("permissionMatrix" ? 'supportorInterviewDefaultApplied')
    `,
  );
}

export async function updateFinancePasswordHash(hash: string) {
  await ensureAppSettingsRow();

  const availableColumns = await getAppSettingsColumns();

  if (!availableColumns.has("financePasswordHash")) {
    return;
  }

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "AppSettings"
      SET
        "financePasswordHash" = ${hash},
        "updatedAt" = NOW()
      WHERE "id" = ${getSettingsId()}
    `,
  );
}

export async function updateJobApplicationStacks(stacks: string[]) {
  await ensureAppSettingsRow();

  const availableColumns = await getAppSettingsColumns();
  const current = await getAppSettingsRow();
  const parsedPermissionMatrix =
    current.permissionMatrix &&
    typeof current.permissionMatrix === "object" &&
    !Array.isArray(current.permissionMatrix)
      ? (current.permissionMatrix as Record<string, unknown>)
      : {};

  if (availableColumns.has("jobApplicationStacks")) {
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "AppSettings"
        SET
          "jobApplicationStacks" = ${JSON.stringify(stacks)}::jsonb,
          "permissionMatrix" = ${JSON.stringify({
            ...parsedPermissionMatrix,
            jobApplicationStacks: stacks,
          })}::jsonb,
          "updatedAt" = NOW()
        WHERE "id" = ${getSettingsId()}
      `,
    );

    return;
  }

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "AppSettings"
      SET
        "permissionMatrix" = ${JSON.stringify({
          ...parsedPermissionMatrix,
          jobApplicationStacks: stacks,
        })}::jsonb,
        "updatedAt" = NOW()
      WHERE "id" = ${getSettingsId()}
    `,
  );
}

async function getAppSettingsColumns() {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>(
    Prisma.sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'AppSettings'
    `,
  );

  return new Set(rows.map((row) => row.column_name));
}

async function readAppSettingsRow(availableColumns: Set<string>) {
  const selectParts = [`"permissionMatrix"`];

  if (availableColumns.has("jobApplicationStacks")) {
    selectParts.push(`"jobApplicationStacks"`);
  }

  if (availableColumns.has("financePasswordHash")) {
    selectParts.push(`"financePasswordHash"`);
  }

  try {
    return await prisma.$queryRawUnsafe<
      AppSettingsQueryRow[]
    >(
      `SELECT ${selectParts.join(", ")} FROM "AppSettings" WHERE "id" = $1 LIMIT 1`,
      getSettingsId(),
    );
  } catch (error) {
    throw error;
  }
}
