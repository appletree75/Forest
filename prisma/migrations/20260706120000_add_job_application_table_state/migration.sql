CREATE TABLE "public"."JobApplicationTableState" (
    "profileId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplicationTableState_pkey" PRIMARY KEY ("profileId","dayKey")
);

CREATE INDEX "JobApplicationTableState_updatedAt_idx" ON "public"."JobApplicationTableState"("updatedAt");
