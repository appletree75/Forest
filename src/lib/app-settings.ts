import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureDatabaseConnected, getSettingsId } from "@/lib/database";
import { defaultPermissionMatrix } from "@/lib/permission-config";

type AppSettingsRow = {
  permissionMatrix: unknown;
  financePasswordHash: string | null;
};

type AppSettingsQueryRow = {
  permissionMatrix: unknown;
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
  const rows = await readAppSettingsRow(availableColumns);

  const row = rows[0];

  if (!row) {
    return {
      permissionMatrix: defaultPermissionMatrix,
      financePasswordHash: null,
    };
  }

  return {
    permissionMatrix: row.permissionMatrix,
    financePasswordHash: row.financePasswordHash ?? null,
  };
}

export async function updateAppSettingsPermissionMatrix(
  permissionMatrix: Record<string, unknown>,
) {
  await ensureAppSettingsRow();

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "AppSettings"
      SET
        "permissionMatrix" = ${JSON.stringify(permissionMatrix)}::jsonb,
        "updatedAt" = NOW()
      WHERE "id" = ${getSettingsId()}
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

  const current = await getAppSettingsRow();
  const parsedPermissionMatrix =
    current.permissionMatrix &&
    typeof current.permissionMatrix === "object" &&
    !Array.isArray(current.permissionMatrix)
      ? (current.permissionMatrix as Record<string, unknown>)
      : {};

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

function isMissingColumnError(error: unknown, columnName: string) {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  const normalizedColumn = columnName.toLowerCase();

  return (
    normalizedMessage.includes("does not exist") &&
    (normalizedMessage.includes(normalizedColumn) ||
      normalizedMessage.includes(`appsettings.${normalizedColumn}`) ||
      normalizedMessage.includes(`column "${normalizedColumn}"`) ||
      normalizedMessage.includes(`column \`${normalizedColumn}\``))
  );
}
