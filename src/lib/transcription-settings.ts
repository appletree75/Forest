import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { getSelectedApiKey } from "@/lib/ai-settings";
import { ensureDatabaseConnected } from "@/lib/database";
import { prisma } from "@/lib/prisma";
import type {
  TranscriptionProvider,
  TranscriptionProviderSetting,
} from "@/lib/types";

type TranscriptionProviderRow = {
  id: string;
  provider: string;
  name: string;
  apiKey: string;
  model: string;
  isSelected: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SelectedTranscriptionProvider = {
  id: string;
  provider: TranscriptionProvider;
  name: string;
  apiKey: string;
  model: string;
};

export const TRANSCRIPTION_PROVIDER_DEFAULT_MODELS: Record<
  TranscriptionProvider,
  string
> = {
  openai: "gpt-4o-mini-transcribe",
  deepgram: "nova-3",
};

function isTranscriptionProvider(value: string): value is TranscriptionProvider {
  return value === "openai" || value === "deepgram";
}

function maskApiKey(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 10) {
    return "********";
  }
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function mapProvider(row: TranscriptionProviderRow): TranscriptionProviderSetting {
  return {
    id: row.id,
    provider: isTranscriptionProvider(row.provider) ? row.provider : "openai",
    name: row.name,
    apiKeyMasked: maskApiKey(row.apiKey),
    model: row.model,
    isSelected: row.isSelected,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function readProviderRows() {
  return prisma.$queryRaw<TranscriptionProviderRow[]>(Prisma.sql`
    SELECT "id", "provider", "name", "apiKey", "model", "isSelected",
      "createdAt", "updatedAt"
    FROM "TranscriptionProviderSetting"
    ORDER BY "isSelected" DESC, "createdAt" ASC
  `);
}

export async function getTranscriptionProviders() {
  await ensureDatabaseConnected();
  return (await readProviderRows()).map(mapProvider);
}

export async function getSelectedTranscriptionProvider() {
  await ensureDatabaseConnected();
  const rows = await prisma.$queryRaw<TranscriptionProviderRow[]>(Prisma.sql`
    SELECT "id", "provider", "name", "apiKey", "model", "isSelected",
      "createdAt", "updatedAt"
    FROM "TranscriptionProviderSetting"
    WHERE "isSelected" = true
    ORDER BY "createdAt" ASC
    LIMIT 1
  `);
  const row = rows[0];
  if (row && isTranscriptionProvider(row.provider)) {
    return {
      id: row.id,
      provider: row.provider,
      name: row.name,
      apiKey: row.apiKey,
      model: row.model || TRANSCRIPTION_PROVIDER_DEFAULT_MODELS[row.provider],
    } satisfies SelectedTranscriptionProvider;
  }

  const selectedAiKey = await getSelectedApiKey();
  if (selectedAiKey?.provider.toLowerCase() !== "openai" || !selectedAiKey.apiKey) {
    return null;
  }
  return {
    id: selectedAiKey.id,
    provider: "openai",
    name: "OpenAI (Settings)",
    apiKey: selectedAiKey.apiKey,
    model: TRANSCRIPTION_PROVIDER_DEFAULT_MODELS.openai,
  } satisfies SelectedTranscriptionProvider;
}

export async function addTranscriptionProvider(input: {
  provider: TranscriptionProvider;
  name: string;
  apiKey: string;
  model?: string;
}) {
  await ensureDatabaseConnected();
  const name = input.name.trim();
  const apiKey = input.apiKey.trim();
  if (!name || !apiKey) {
    throw new Error("Provider name and API key are required.");
  }

  const selected = (await readProviderRows()).some((row) => row.isSelected);
  const id = randomUUID();
  const model =
    input.model?.trim() || TRANSCRIPTION_PROVIDER_DEFAULT_MODELS[input.provider];
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "TranscriptionProviderSetting" (
      "id", "provider", "name", "apiKey", "model", "isSelected",
      "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${input.provider}, ${name}, ${apiKey}, ${model}, ${!selected},
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `);

  return id;
}

export async function selectTranscriptionProvider(id: string) {
  await ensureDatabaseConnected();
  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "TranscriptionProviderSetting" WHERE "id" = ${id} LIMIT 1
  `);
  if (!existing[0]) {
    throw new Error("Transcription provider was not found.");
  }
  const changed = await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      UPDATE "TranscriptionProviderSetting"
      SET "isSelected" = false, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "isSelected" = true
    `),
    prisma.$executeRaw(Prisma.sql`
      UPDATE "TranscriptionProviderSetting"
      SET "isSelected" = true, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
    `),
  ]);
  if (changed[1] === 0) {
    throw new Error("Transcription provider was not found.");
  }
}

export async function removeTranscriptionProvider(id: string) {
  await ensureDatabaseConnected();
  const selectedRows = await prisma.$queryRaw<Array<{ isSelected: boolean }>>(
    Prisma.sql`
      SELECT "isSelected"
      FROM "TranscriptionProviderSetting"
      WHERE "id" = ${id}
      LIMIT 1
    `,
  );
  if (!selectedRows[0]) {
    throw new Error("Transcription provider was not found.");
  }

  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "TranscriptionProviderSetting" WHERE "id" = ${id}
  `);
  if (selectedRows[0].isSelected) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "TranscriptionProviderSetting"
      SET "isSelected" = true, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = (
        SELECT "id" FROM "TranscriptionProviderSetting"
        ORDER BY "createdAt" ASC
        LIMIT 1
      )
    `);
  }
}
