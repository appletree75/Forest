CREATE TABLE IF NOT EXISTS "TranscriptionProviderSetting" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "apiKey" TEXT NOT NULL,
  "model" TEXT NOT NULL DEFAULT '',
  "isSelected" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TranscriptionProviderSetting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TranscriptionProviderSetting_isSelected_idx"
ON "TranscriptionProviderSetting"("isSelected");
