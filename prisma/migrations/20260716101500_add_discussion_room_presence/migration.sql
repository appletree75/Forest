CREATE TABLE "DiscussionRoomPresence" (
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userRole" "Role" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionRoomPresence_pkey" PRIMARY KEY ("roomId","userId")
);

CREATE INDEX "DiscussionRoomPresence_lastSeenAt_idx" ON "DiscussionRoomPresence"("lastSeenAt");

ALTER TABLE "DiscussionRoomPresence"
ADD CONSTRAINT "DiscussionRoomPresence_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "DiscussionRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
