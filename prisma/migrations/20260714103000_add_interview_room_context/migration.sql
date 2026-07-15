CREATE TABLE "InterviewRoomContext" (
    "roomKey" TEXT NOT NULL,
    "resume" TEXT NOT NULL DEFAULT '',
    "jd" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewRoomContext_pkey" PRIMARY KEY ("roomKey")
);

CREATE INDEX "InterviewRoomContext_updatedBy_idx" ON "InterviewRoomContext"("updatedBy");
