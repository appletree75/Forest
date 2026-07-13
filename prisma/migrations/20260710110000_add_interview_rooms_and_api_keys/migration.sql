CREATE TYPE "RoomChatChannel" AS ENUM ('team', 'ai');
CREATE TYPE "RoomMessageRole" AS ENUM ('user', 'assistant', 'system');

CREATE TABLE "ApiKeySetting" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "apiKey" TEXT NOT NULL,
  "isSelected" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ApiKeySetting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiKeySetting_provider_isSelected_idx"
ON "ApiKeySetting"("provider", "isSelected");

CREATE TABLE "InterviewRoomMessage" (
  "id" TEXT NOT NULL,
  "roomKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "channel" "RoomChatChannel" NOT NULL,
  "role" "RoomMessageRole" NOT NULL,
  "userId" TEXT,
  "userName" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InterviewRoomMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InterviewRoomMessage_roomKey_channel_createdAt_idx"
ON "InterviewRoomMessage"("roomKey", "channel", "createdAt");

CREATE INDEX "InterviewRoomMessage_eventType_eventId_createdAt_idx"
ON "InterviewRoomMessage"("eventType", "eventId", "createdAt");

CREATE TABLE "InterviewRoomPresence" (
  "roomKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "userRole" "Role" NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InterviewRoomPresence_pkey" PRIMARY KEY ("roomKey","userId")
);

CREATE INDEX "InterviewRoomPresence_lastSeenAt_idx"
ON "InterviewRoomPresence"("lastSeenAt");
