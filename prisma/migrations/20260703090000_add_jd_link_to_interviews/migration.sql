ALTER TABLE "public"."Interview"
ADD COLUMN "jdLink" TEXT NOT NULL DEFAULT '';

ALTER TABLE "public"."IcsEventOverride"
ADD COLUMN "jdLink" TEXT NOT NULL DEFAULT '';
