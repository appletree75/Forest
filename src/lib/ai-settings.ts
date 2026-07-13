import { revalidateTag, unstable_cache } from "next/cache";

import {
  ensureDatabaseConnected,
  isDatabaseUnavailable,
} from "@/lib/database";
import { prisma } from "@/lib/prisma";
import type { ApiKeySetting } from "@/lib/types";

const DEFAULT_DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY?.trim() ?? "";
const DEFAULT_PROVIDER = "deepseek";
const DEFAULT_NAME = "DeepSeek Primary";

function maskApiKey(value: string) {
  const trimmed = value.trim();

  if (trimmed.length <= 10) {
    return "********";
  }

  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function mapApiKey(row: {
  id: string;
  provider: string;
  name: string;
  apiKey: string;
  isSelected: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ApiKeySetting {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    apiKeyMasked: maskApiKey(row.apiKey),
    isSelected: row.isSelected,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureDefaultApiKey() {
  if (!DEFAULT_DEEPSEEK_KEY) {
    return null;
  }

  await ensureDatabaseConnected();

  const existing = await prisma.apiKeySetting.findFirst({
    where: { provider: DEFAULT_PROVIDER },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    if (!existing.isSelected) {
      await prisma.apiKeySetting.update({
        where: { id: existing.id },
        data: { isSelected: true },
      });
      revalidateTag("api-keys");
    }

    return existing;
  }

  const created = await prisma.apiKeySetting.create({
    data: {
      provider: DEFAULT_PROVIDER,
      name: DEFAULT_NAME,
      apiKey: DEFAULT_DEEPSEEK_KEY,
      isSelected: true,
    },
  });

  revalidateTag("api-keys");
  return created;
}

const getCachedApiKeys = unstable_cache(
  async (): Promise<ApiKeySetting[]> => {
    try {
      await ensureDefaultApiKey();

      const rows = await prisma.apiKeySetting.findMany({
        orderBy: [{ isSelected: "desc" }, { createdAt: "asc" }],
      });

      return rows.map(mapApiKey);
    } catch (error) {
      if (!isDatabaseUnavailable(error)) {
        throw error;
      }

      return DEFAULT_DEEPSEEK_KEY
        ? [
            {
              id: "fallback-deepseek",
              provider: DEFAULT_PROVIDER,
              name: DEFAULT_NAME,
              apiKeyMasked: maskApiKey(DEFAULT_DEEPSEEK_KEY),
              isSelected: true,
              createdAt: "",
              updatedAt: "",
            },
          ]
        : [];
    }
  },
  ["api-keys"],
  { tags: ["api-keys"] },
);

export async function getApiKeys() {
  return getCachedApiKeys();
}

export async function addApiKey(input: {
  provider: string;
  name: string;
  apiKey: string;
}) {
  await ensureDatabaseConnected();

  const provider = input.provider.trim().toLowerCase() || DEFAULT_PROVIDER;
  const name = input.name.trim() || input.provider.trim() || "API key";
  const apiKey = input.apiKey.trim();

  if (!apiKey) {
    throw new Error("API key is required.");
  }

  const selectedExists = await prisma.apiKeySetting.count({
    where: { isSelected: true },
  });

  const created = await prisma.apiKeySetting.create({
    data: {
      provider,
      name,
      apiKey,
      isSelected: selectedExists === 0,
    },
  });

  revalidateTag("api-keys");
  return mapApiKey(created);
}

export async function selectApiKey(id: string) {
  await ensureDatabaseConnected();

  await prisma.$transaction([
    prisma.apiKeySetting.updateMany({
      data: { isSelected: false },
      where: { isSelected: true },
    }),
    prisma.apiKeySetting.update({
      where: { id },
      data: { isSelected: true },
    }),
  ]);

  revalidateTag("api-keys");
}

export async function removeApiKey(id: string) {
  await ensureDatabaseConnected();

  const current = await prisma.apiKeySetting.findUnique({
    where: { id },
  });

  if (!current) {
    return;
  }

  await prisma.apiKeySetting.delete({ where: { id } });

  if (current.isSelected) {
    const fallback = await prisma.apiKeySetting.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (fallback) {
      await prisma.apiKeySetting.update({
        where: { id: fallback.id },
        data: { isSelected: true },
      });
    } else {
      await ensureDefaultApiKey();
    }
  }

  revalidateTag("api-keys");
}

export async function getSelectedApiKey() {
  try {
    await ensureDefaultApiKey();

    const selected =
      (await prisma.apiKeySetting.findFirst({
        where: { isSelected: true },
        orderBy: { createdAt: "asc" },
      })) ??
      (await prisma.apiKeySetting.findFirst({
        orderBy: { createdAt: "asc" },
      }));

    return selected;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return DEFAULT_DEEPSEEK_KEY
      ? {
          id: "fallback-deepseek",
          provider: DEFAULT_PROVIDER,
          name: DEFAULT_NAME,
          apiKey: DEFAULT_DEEPSEEK_KEY,
          isSelected: true,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        }
      : null;
  }
}
