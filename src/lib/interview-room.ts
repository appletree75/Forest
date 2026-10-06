import { randomUUID } from "node:crypto";
import { revalidateTag } from "next/cache";
import {
  Prisma,
  Role as PrismaRole,
  RoomChatChannel,
  RoomMessageRole,
} from "@prisma/client";

import { ensureDatabaseConnected } from "@/lib/database";
import defaultInterviewAiPrompt from "@/data/default-interview-ai-prompt.json";
import { prisma } from "@/lib/prisma";
import type {
  InterviewRoomContext,
  InterviewRoomMessage,
  InterviewRoomPresence,
  Role,
} from "@/lib/types";

const PRESENCE_TTL_MS = 90 * 1000;

type InterviewRoomUploadAttachment = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
};

type InterviewRoomAttachmentRow = InterviewRoomUploadAttachment & {
  id: string;
  messageId: string;
  createdAt: Date;
};

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
}, attachments: InterviewRoomAttachmentRow[] = []): InterviewRoomMessage {
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
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      dataUrl: attachment.dataUrl,
      createdAt: attachment.createdAt.toISOString(),
    })),
  };
}

type InterviewRoomContextRow = {
  roomKey: string;
  resume: string;
  jd: string;
  details: string;
  reference: string;
  aiPrompt?: string;
  sharedNote: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapContext(row: InterviewRoomContextRow): InterviewRoomContext {
  return {
    roomKey: row.roomKey,
    resume: row.resume,
    jd: row.jd,
    details: row.details,
    reference: row.reference,
    aiPrompt: row.aiPrompt?.trim() || defaultInterviewAiPrompt.prompt,
    sharedNote: row.sharedNote,
    updatedBy: row.updatedBy ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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

export async function removeInterviewRoomPresence(roomKey: string, userId: string) {
  await ensureDatabaseConnected();

  await prisma.interviewRoomPresence.deleteMany({
    where: {
      roomKey,
      userId,
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

  const [presenceRows, messageRows, contextRows, attachmentRows] = await Promise.all([
    prisma.interviewRoomPresence.findMany({
      where: { roomKey },
      orderBy: [{ userRole: "asc" }, { userName: "asc" }],
    }),
    prisma.interviewRoomMessage.findMany({
      where: { roomKey },
      orderBy: { createdAt: "asc" },
      take: 400,
    }),
    prisma.$queryRaw<InterviewRoomContextRow[]>(Prisma.sql`
      SELECT
        "roomKey", "resume", "jd", "details", "reference", "aiPrompt",
        "sharedNote", "updatedBy", "createdAt", "updatedAt"
      FROM "InterviewRoomContext"
      WHERE "roomKey" = ${roomKey}
      LIMIT 1
    `),
    prisma.$queryRaw<InterviewRoomAttachmentRow[]>(Prisma.sql`
      SELECT
        a."id",
        a."messageId",
        a."name",
        a."mimeType",
        a."sizeBytes",
        a."dataUrl",
        a."createdAt"
      FROM "InterviewRoomAttachment" a
      INNER JOIN "InterviewRoomMessage" m ON m."id" = a."messageId"
      WHERE m."roomKey" = ${roomKey}
      ORDER BY a."createdAt" ASC
    `),
  ]);

  const attachmentsByMessage = Map.groupBy(
    attachmentRows,
    (attachment) => attachment.messageId,
  );

  return {
    presence: presenceRows.map(mapPresence),
    messages: messageRows.map((message) =>
      mapMessage(message, attachmentsByMessage.get(message.id)),
    ),
    context: contextRows[0]
      ? mapContext(contextRows[0])
      : emptyInterviewRoomContext(roomKey),
  };
}

export function emptyInterviewRoomContext(roomKey: string): InterviewRoomContext {
  return {
    roomKey,
    resume: "",
    jd: "",
    details: "",
    reference: "",
    aiPrompt: defaultInterviewAiPrompt.prompt,
    sharedNote: "",
    updatedBy: "",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
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
  attachments?: InterviewRoomUploadAttachment[];
}) {
  await ensureDatabaseConnected();

  const attachments = (input.attachments ?? [])
    .filter(
      (attachment) =>
        attachment.name.trim() &&
        attachment.mimeType.trim() &&
        attachment.dataUrl.startsWith("data:"),
    )
    .slice(0, 8);
  const createdAt = new Date();
  const attachmentRows = attachments.map((attachment) => ({
    id: randomUUID(),
    messageId: "",
    name: attachment.name.trim(),
    mimeType: attachment.mimeType.trim(),
    sizeBytes: Math.max(0, Math.round(attachment.sizeBytes || 0)),
    dataUrl: attachment.dataUrl,
    createdAt,
  }));
  const created = await prisma.$transaction(async (tx) => {
    const message = await tx.interviewRoomMessage.create({
      data: {
        roomKey: input.roomKey,
        eventType: input.eventType,
        eventId: input.eventId,
        channel: input.channel as RoomChatChannel,
        role: input.role as RoomMessageRole,
        userId: input.userId?.trim() || null,
        userName: input.userName.trim() || "Unknown",
        content: input.content.trim(),
        createdAt,
      },
    });

    if (attachmentRows.length > 0) {
      const values = Prisma.join(
        attachmentRows.map((attachment) =>
          Prisma.sql`(
            ${attachment.id},
            ${message.id},
            ${attachment.name},
            ${attachment.mimeType},
            ${attachment.sizeBytes},
            ${attachment.dataUrl},
            ${createdAt}
          )`,
        ),
      );

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "InterviewRoomAttachment" (
          "id", "messageId", "name", "mimeType", "sizeBytes", "dataUrl", "createdAt"
        ) VALUES ${values}
      `);
    }

    return message;
  });

  revalidateTag(`room:${input.roomKey}`);
  return mapMessage(
    created,
    attachmentRows.map((attachment) => ({
      ...attachment,
      messageId: created.id,
    })),
  );
}

export async function upsertInterviewRoomContext(input: {
  roomKey: string;
  resume: string;
  jd: string;
  details: string;
  reference: string;
  aiPrompt?: string;
  updatedBy: string;
}) {
  await ensureDatabaseConnected();

  await prisma.interviewRoomContext.upsert({
    where: { roomKey: input.roomKey },
    update: {
      resume: input.resume.trim(),
      jd: input.jd.trim(),
      details: input.details.trim(),
      reference: input.reference.trim(),
      updatedBy: input.updatedBy.trim() || null,
    },
    create: {
      roomKey: input.roomKey,
      resume: input.resume.trim(),
      jd: input.jd.trim(),
      details: input.details.trim(),
      reference: input.reference.trim(),
      updatedBy: input.updatedBy.trim() || null,
    },
  });

  if (input.aiPrompt !== undefined) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "InterviewRoomContext"
      SET "aiPrompt" = ${input.aiPrompt.trim()}
      WHERE "roomKey" = ${input.roomKey}
    `);
  }

  const saved = await getInterviewRoomContext(input.roomKey);

  revalidateTag(`room:${input.roomKey}`);
  return saved;
}

export async function updateInterviewRoomSharedNote(input: {
  roomKey: string;
  sharedNote: string;
  updatedBy: string;
}) {
  await ensureDatabaseConnected();

  await prisma.interviewRoomContext.upsert({
    where: { roomKey: input.roomKey },
    update: {
      sharedNote: input.sharedNote.trim(),
      updatedBy: input.updatedBy.trim() || null,
    },
    create: {
      roomKey: input.roomKey,
      sharedNote: input.sharedNote.trim(),
      updatedBy: input.updatedBy.trim() || null,
    },
  });

  const saved = await getInterviewRoomContext(input.roomKey);

  revalidateTag(`room:${input.roomKey}`);
  return saved;
}

async function getInterviewRoomContext(roomKey: string) {
  const rows = await prisma.$queryRaw<InterviewRoomContextRow[]>(Prisma.sql`
    SELECT
      "roomKey", "resume", "jd", "details", "reference", "aiPrompt",
      "sharedNote", "updatedBy", "createdAt", "updatedAt"
    FROM "InterviewRoomContext"
    WHERE "roomKey" = ${roomKey}
    LIMIT 1
  `);

  return rows[0] ? mapContext(rows[0]) : emptyInterviewRoomContext(roomKey);
}
