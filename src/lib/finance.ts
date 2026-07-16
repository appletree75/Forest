import { randomUUID } from "node:crypto";

import { unstable_cache, revalidateTag } from "next/cache";

import {
  ensureDatabaseConnected,
  getSettingsId,
  isDatabaseUnavailable,
} from "@/lib/database";
import { defaultPermissionMatrix } from "@/lib/permission-config";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import type { FinanceTransaction } from "@/lib/types";

const getCachedTransactions = unstable_cache(
  async (): Promise<FinanceTransaction[]> => {
    try {
      await ensureDatabaseConnected();

      const transactions = await prisma.financeTransaction.findMany({
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      });

      return transactions.map((transaction) => ({
        id: transaction.id,
        to: transaction.to,
        amount: sanitizeAmount(transaction.amount),
        date: transaction.date,
        note: transaction.note,
        createdAt: transaction.createdAt.toISOString(),
      }));
    } catch (error) {
      if (!isDatabaseUnavailable(error)) {
        throw error;
      }

      return [];
    }
  },
  ["finance-transactions"],
  { tags: ["finance-transactions"] },
);

export async function getFinanceTransactions() {
  return getCachedTransactions();
}

export async function createFinanceTransaction(input: {
  to: string;
  amount: unknown;
  date: string;
  note: string;
}) {
  await ensureDatabaseConnected();

  const transaction = await prisma.financeTransaction.create({
    data: {
      id: randomUUID(),
      to: String(input.to ?? "").trim(),
      amount: sanitizeAmount(input.amount),
      date: String(input.date ?? "").trim(),
      note: String(input.note ?? "").trim(),
    },
  });

  revalidateTag("finance-transactions");

  return {
    id: transaction.id,
    to: transaction.to,
    amount: transaction.amount,
    date: transaction.date,
    note: transaction.note,
    createdAt: transaction.createdAt.toISOString(),
  } satisfies FinanceTransaction;
}

export async function deleteFinanceTransaction(id: string) {
  await ensureDatabaseConnected();
  await prisma.financeTransaction.delete({ where: { id } });
  revalidateTag("finance-transactions");
}

export async function verifyFinancePassword(password: string) {
  const normalizedPassword = password.trim();

  if (!normalizedPassword) {
    return false;
  }

  await ensureDatabaseConnected();

  const settings = await prisma.appSettings.upsert({
    where: { id: getSettingsId() },
    update: {},
    create: {
      id: getSettingsId(),
      permissionMatrix: defaultPermissionMatrix,
    },
    select: {
      financePasswordHash: true,
    },
  });

  if (settings.financePasswordHash) {
    return verifyPassword(normalizedPassword, settings.financePasswordHash);
  }

  const fallbackPassword =
    process.env.FINANCE_PANEL_PASSWORD?.trim() || "nex-finance";

  return normalizedPassword === fallbackPassword;
}

export async function setFinancePassword(password: string) {
  const normalizedPassword = password.trim();

  await ensureDatabaseConnected();

  await prisma.appSettings.upsert({
    where: { id: getSettingsId() },
    update: {
      financePasswordHash: hashPassword(normalizedPassword),
    },
    create: {
      id: getSettingsId(),
      permissionMatrix: defaultPermissionMatrix,
      financePasswordHash: hashPassword(normalizedPassword),
    },
    select: {
      id: true,
    },
  });
}

function sanitizeAmount(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.round(numeric * 100) / 100);
}
