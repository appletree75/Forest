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
  model: string;
  name: string;
  apiKey: string;
  isSelected: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ApiKeySetting {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    name: row.name,
    apiKeyMasked: maskApiKey(row.apiKey),
    isSelected: row.isSelected,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function normalizeSelectedApiKeys() {
  const selectedRows = await prisma.apiKeySetting.findMany({
    where: { isSelected: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (selectedRows.length <= 1) {
    return selectedRows[0]?.id ?? null;
  }

  const [primary, ...duplicates] = selectedRows;

  await prisma.apiKeySetting.updateMany({
    where: { id: { in: duplicates.map((row) => row.id) } },
    data: { isSelected: false },
  });

  return primary.id;
}

export async function ensureDefaultApiKey() {
  if (!DEFAULT_DEEPSEEK_KEY) {
    return null;
  }

  await ensureDatabaseConnected();

  const selectedId = await normalizeSelectedApiKeys();

  const selected = selectedId
    ? await prisma.apiKeySetting.findUnique({
        where: { id: selectedId },
      })
    : null;

  const existing = await prisma.apiKeySetting.findFirst({
    where: { provider: DEFAULT_PROVIDER },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    if (!selected) {
      await prisma.apiKeySetting.update({
        where: { id: existing.id },
        data: { isSelected: true },
      });
    }

    return existing;
  }

  const created = await prisma.apiKeySetting.create({
    data: {
      provider: DEFAULT_PROVIDER,
      name: DEFAULT_NAME,
      apiKey: DEFAULT_DEEPSEEK_KEY,
      isSelected: !selected,
    },
  });

  return created;
}

const getCachedApiKeys = unstable_cache(
  async (): Promise<ApiKeySetting[]> => {
    try {
      await ensureDefaultApiKey();
      const selectedId = await normalizeSelectedApiKeys();

      const rows = await prisma.apiKeySetting.findMany({
        orderBy: [{ createdAt: "asc" }],
      });

      return rows
        .map((row) =>
          mapApiKey({
            ...row,
            isSelected: selectedId != null && row.id === selectedId,
          }),
        )
        .sort((left, right) => Number(right.isSelected) - Number(left.isSelected));
    } catch (error) {
      if (!isDatabaseUnavailable(error)) {
        throw error;
      }

      return DEFAULT_DEEPSEEK_KEY
        ? [
            {
              id: "fallback-deepseek",
              provider: DEFAULT_PROVIDER,
              model: "",
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
  model?: string;
}) {
  await ensureDatabaseConnected();

  const provider = input.provider.trim().toLowerCase();
  if (provider !== "openai" && provider !== "deepseek") {
    throw new Error("Choose OpenAI or DeepSeek as the provider.");
  }
  const name = input.name.trim() || input.provider.trim() || "API key";
  const apiKey = input.apiKey.trim();
  const model = validateModelId(input.model ?? "");

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
      model,
      isSelected: selectedExists === 0,
    },
  });

  revalidateTag("api-keys");
  return mapApiKey(created);
}

export async function updateApiKeyProvider(id: string, provider: string) {
  await ensureDatabaseConnected();
  const normalized = provider.trim().toLowerCase();
  if (normalized !== "openai" && normalized !== "deepseek") {
    throw new Error("Choose OpenAI or DeepSeek as the provider.");
  }
  await prisma.apiKeySetting.update({
    where: { id },
    data: { provider: normalized, model: "" },
  });
  revalidateTag("api-keys");
}

function validateModelId(model: string) {
  const normalized = model.trim();
  if (normalized.length > 200 || (normalized && !/^[a-zA-Z0-9][a-zA-Z0-9._:/+-]*$/.test(normalized))) {
    throw new Error("Enter a valid model ID (up to 200 characters).");
  }
  return normalized;
}

export async function updateApiKeyModel(id: string, model: string) {
  await ensureDatabaseConnected();
  const normalized = validateModelId(model);
  await prisma.apiKeySetting.update({
    where: { id },
    data: { model: normalized },
  });
  revalidateTag("api-keys");
}

export async function getAvailableModels(id: string) {
  await ensureDatabaseConnected();
  const setting = await prisma.apiKeySetting.findUnique({ where: { id } });
  if (!setting) {
    throw new Error("API key not found.");
  }
  const provider = setting.provider.toLowerCase();
  const url = provider === "openai"
    ? "https://api.openai.com/v1/models"
    : provider === "deepseek"
      ? "https://api.deepseek.com/models"
      : null;
  if (!url) {
    throw new Error("This provider does not support model listing.");
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${setting.apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(response.status === 401 || response.status === 403
      ? "The provider rejected this API key. Check its provider and key."
      : `Unable to load models (HTTP ${response.status}).`);
  }
  const payload = (await response.json()) as { data?: Array<{ id?: string }> };
  return [...new Set((payload.data ?? []).map((model) => model.id).filter((model): model is string => Boolean(model)))].sort();
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
    const selectedId = await normalizeSelectedApiKeys();

    const selected =
      (selectedId
        ? await prisma.apiKeySetting.findUnique({
            where: { id: selectedId },
          })
        : null) ??
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
          model: "",
          name: DEFAULT_NAME,
          apiKey: DEFAULT_DEEPSEEK_KEY,
          isSelected: true,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        }
      : null;
  }
}
