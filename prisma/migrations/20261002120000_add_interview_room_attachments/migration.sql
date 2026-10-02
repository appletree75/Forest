CREATE TABLE "InterviewRoomAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewRoomAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InterviewRoomAttachment_messageId_idx"
ON "InterviewRoomAttachment"("messageId");

ALTER TABLE "InterviewRoomAttachment"
ADD CONSTRAINT "InterviewRoomAttachment_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "InterviewRoomMessage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
