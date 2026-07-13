import { revalidateTag } from "next/cache";
import {
  Role as PrismaRole,
  RoomChatChannel,
  RoomMessageRole,
} from "@prisma/client";

import { ensureDatabaseConnected } from "@/lib/database";
import { prisma } from "@/lib/prisma";
import type {
  InterviewRoomMessage,
  InterviewRoomPresence,
  Role,
} from "@/lib/types";

const PRESENCE_TTL_MS = 90 * 1000;

export function buildInterviewRoomKey(eventType: "local" | "imported", eventId: string) {
  return `${eventType}:${eventId}`;
}

export function parseInterviewRoomKey(roomKey: string) {
  const [eventType, ...rest] = roomKey.split(":");
  return {
    eventType: eventType === "imported" ? "imported" : "local",
    eventId: rest.join(":"),
  } as const;
}

function mapPresence(row: {
  roomKey: string;
  userId: string;
  userName: string;
  userRole: PrismaRole;
  joinedAt: Date;
  lastSeenAt: Date;
}): InterviewRoomPresence {
  return {
    roomKey: row.roomKey,
    userId: row.userId,
    userName: row.userName,
    userRole: row.userRole,
    joinedAt: row.joinedAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

function mapMessage(row: {
  id: string;
  roomKey: string;
  eventType: string;
  eventId: string;
  channel: RoomChatChannel;
  role: RoomMessageRole;
  userId: string | null;
  userName: string;
  content: string;
  createdAt: Date;
}): InterviewRoomMessage {
  return {
    id: row.id,
    roomKey: row.roomKey,
    eventType: row.eventType,
    eventId: row.eventId,
    channel: row.channel,
    role: row.role,
    userId: row.userId ?? "",
    userName: row.userName,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function touchInterviewRoomPresence(input: {
  roomKey: string;
  userId: string;
  userName: string;
  userRole: Role;
}) {
  await ensureDatabaseConnected();

  await prisma.interviewRoomPresence.upsert({
    where: {
      roomKey_userId: {
        roomKey: input.roomKey,
        userId: input.userId,
      },
    },
    update: {
      userName: input.userName,
      userRole: input.userRole as PrismaRole,
      lastSeenAt: new Date(),
    },
    create: {
      roomKey: input.roomKey,
      userId: input.userId,
      userName: input.userName,
      userRole: input.userRole as PrismaRole,
    },
  });
}

export async function pruneInterviewRoomPresence() {
  await ensureDatabaseConnected();

  const threshold = new Date(Date.now() - PRESENCE_TTL_MS);
  await prisma.interviewRoomPresence.deleteMany({
    where: {
      lastSeenAt: {
        lt: threshold,
      },
    },
  });
}

export async function getInterviewRoomState(roomKey: string) {
  await pruneInterviewRoomPresence();
  await ensureDatabaseConnected();

  const [presenceRows, messageRows] = await Promise.all([
    prisma.interviewRoomPresence.findMany({
      where: { roomKey },
      orderBy: [{ userRole: "asc" }, { userName: "asc" }],
    }),
    prisma.interviewRoomMessage.findMany({
      where: { roomKey },
      orderBy: { createdAt: "asc" },
      take: 400,
    }),
  ]);

  return {
    presence: presenceRows.map(mapPresence),
    messages: messageRows.map(mapMessage),
  };
}

export async function createInterviewRoomMessage(input: {
  roomKey: string;
  eventType: "local" | "imported";
  eventId: string;
  channel: "team" | "ai";
  role: "user" | "assistant" | "system";
  userId?: string;
  userName: string;
  content: string;
}) {
  await ensureDatabaseConnected();

  const created = await prisma.interviewRoomMessage.create({
    data: {
      roomKey: input.roomKey,
      eventType: input.eventType,
      eventId: input.eventId,
      channel: input.channel as RoomChatChannel,
      role: input.role as RoomMessageRole,
      userId: input.userId?.trim() || null,
      userName: input.userName.trim() || "Unknown",
      content: input.content.trim(),
    },
  });

  revalidateTag(`room:${input.roomKey}`);
  return mapMessage(created);
}
