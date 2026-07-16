CREATE TABLE "DiscussionRoom" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DiscussionRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscussionRoomMember" (
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DiscussionRoomMember_pkey" PRIMARY KEY ("roomId","userId")
);

CREATE TABLE "DiscussionMessage" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DiscussionMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscussionAttachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "dataUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DiscussionAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscussionRoom_name_key" ON "DiscussionRoom"("name");
CREATE INDEX "DiscussionRoom_lastMessageAt_idx" ON "DiscussionRoom"("lastMessageAt");
CREATE INDEX "DiscussionRoomMember_userId_idx" ON "DiscussionRoomMember"("userId");
CREATE INDEX "DiscussionMessage_roomId_createdAt_idx" ON "DiscussionMessage"("roomId", "createdAt");
CREATE INDEX "DiscussionMessage_userId_createdAt_idx" ON "DiscussionMessage"("userId", "createdAt");
CREATE INDEX "DiscussionAttachment_messageId_idx" ON "DiscussionAttachment"("messageId");

ALTER TABLE "DiscussionRoomMember"
ADD CONSTRAINT "DiscussionRoomMember_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "DiscussionRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscussionMessage"
ADD CONSTRAINT "DiscussionMessage_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "DiscussionRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscussionAttachment"
ADD CONSTRAINT "DiscussionAttachment_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "DiscussionMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
