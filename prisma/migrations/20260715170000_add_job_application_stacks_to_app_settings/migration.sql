ALTER TABLE "AppSettings"
ADD COLUMN IF NOT EXISTS "jobApplicationStacks" JSONB;
