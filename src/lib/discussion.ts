import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { createAuditLog } from "@/lib/audit-log";
import { ensureDatabaseConnected, isDatabaseUnavailable } from "@/lib/database";
import { prisma } from "@/lib/prisma";
import type {
  DiscussionAttachment,
  DiscussionMessage,
  DiscussionRoom,
  SessionUser,
  ManagedUser,
} from "@/lib/types";

type SqlRoomMemberRow = {
  roomId: string;
  userId: string;
  name: string;
};

type SqlAttachmentRow = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  createdAt: Date;
};

type SqlMessageRow = {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: Date;
  attachments: SqlAttachmentRow[] | Prisma.JsonValue;
};

export type DiscussionUploadAttachment = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
};

const DISCUSSION_ROOM_PRESENCE_TTL_MS = 75_000;
const DISCUSSION_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
};

export async function getDiscussionRoomsForUser(
  user: SessionUser,
): Promise<DiscussionRoom[]> {
  try {
    await ensureDatabaseConnected();
    const rooms = await prisma.discussionRoom.findMany({
      where:
        user.role === "admin"
          ? undefined
          : { members: { some: { userId: user.id } } },
      orderBy: [{ lastMessageAt: "desc" }, { name: "asc" }],
    });

    if (rooms.length === 0) {
      return [];
    }

    const roomIds = rooms.map((room) => room.id);
    const [memberRows, presenceRows] = await Promise.all([
      prisma.$queryRaw<SqlRoomMemberRow[]>(Prisma.sql`
        SELECT m."roomId", m."userId", u."name"
        FROM "DiscussionRoomMember" m
        INNER JOIN "User" u ON u."id" = m."userId"
        WHERE m."roomId" IN (${Prisma.join(roomIds)})
        ORDER BY m."roomId" ASC, u."name" ASC
      `),
      prisma.discussionRoomPresence.findMany({
        where: {
          roomId: { in: roomIds },
          lastSeenAt: {
            gte: new Date(Date.now() - DISCUSSION_ROOM_PRESENCE_TTL_MS),
          },
        },
        select: { roomId: true, userId: true },
        orderBy: { joinedAt: "asc" },
      }),
    ]);

    const membersByRoom = Map.groupBy(memberRows, (member) => member.roomId);
    const presenceByRoom = Map.groupBy(presenceRows, (presence) => presence.roomId);

    return rooms.map((room) => {
      const members = membersByRoom.get(room.id) ?? [];
      const activeUsers = presenceByRoom.get(room.id) ?? [];

      return {
        id: room.id,
        name: room.name,
        memberUserIds: members.map((member) => member.userId),
        members: members.map((member) => ({
          id: member.userId,
          name: member.name,
        })),
        memberCount: members.length,
        activeUserIds: activeUsers.map((presence) => presence.userId),
        createdByUserId: room.createdByUserId ?? "",
        createdAt: room.createdAt.toISOString(),
        updatedAt: room.updatedAt.toISOString(),
        lastMessageAt: room.lastMessageAt.toISOString(),
      };
    });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return [];
  }
}

export async function getDiscussionAssignableUsers(): Promise<ManagedUser[]> {
  try {
    await ensureDatabaseConnected();
    const rows = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: {
        sessions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      password: "",
      bidderAppliedRate: row.bidderAppliedRate,
      bidderFailedRate: row.bidderFailedRate,
      callerHourlyRate: row.callerHourlyRate,
      sessions: [],
    }));
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return [];
  }
}

export async function getDiscussionVisibleUsersForUser(
  user: SessionUser,
): Promise<ManagedUser[]> {
  if (user.role === "admin") {
    return getDiscussionAssignableUsers();
  }

  try {
    await ensureDatabaseConnected();

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        email: string;
        role: ManagedUser["role"];
        bidderAppliedRate: number;
        bidderFailedRate: number;
        callerHourlyRate: number;
      }>
    >(Prisma.sql`
      SELECT DISTINCT
        u."id",
        u."name",
        u."email",
        u."role",
        u."bidderAppliedRate",
        u."bidderFailedRate",
        u."callerHourlyRate"
      FROM "User" u
      INNER JOIN "DiscussionRoomMember" member
        ON member."userId" = u."id"
      INNER JOIN "DiscussionRoomMember" self_member
        ON self_member."roomId" = member."roomId"
       AND self_member."userId" = ${user.id}
      ORDER BY u."role" ASC, u."name" ASC
    `);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      password: "",
      bidderAppliedRate: row.bidderAppliedRate,
      bidderFailedRate: row.bidderFailedRate,
      callerHourlyRate: row.callerHourlyRate,
      sessions: [],
    }));
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return [];
  }
}

export async function getDiscussionMessagesForUser(
  user: SessionUser,
  roomId: string,
): Promise<DiscussionMessage[]> {
  await assertDiscussionRoomAccess(user, roomId);
  await ensureDatabaseConnected();

  const rows = await prisma.$queryRaw<SqlMessageRow[]>(Prisma.sql`
    SELECT
      m."id",
      m."roomId",
      m."userId",
      m."userName",
      m."content",
      m."createdAt",
      COALESCE(
        json_agg(
          json_build_object(
            'id', a."id",
            'name', a."name",
            'mimeType', a."mimeType",
            'sizeBytes', a."sizeBytes",
            'dataUrl', a."dataUrl",
            'createdAt', a."createdAt"
          )
          ORDER BY a."createdAt" ASC
        ) FILTER (WHERE a."id" IS NOT NULL),
        '[]'::json
      ) AS "attachments"
    FROM "DiscussionMessage" m
    LEFT JOIN "DiscussionAttachment" a ON a."messageId" = m."id"
    WHERE m."roomId" = ${roomId}
    GROUP BY m."id"
    ORDER BY m."createdAt" ASC
  `);

  return rows.map(mapDiscussionMessage);
}

export async function touchDiscussionRoomPresence(
  user: SessionUser,
  roomId: string,
): Promise<void> {
  await assertDiscussionRoomAccess(user, roomId);
  await ensureDatabaseConnected();

  await prisma.discussionRoomPresence.upsert({
    where: {
      roomId_userId: {
        roomId,
        userId: user.id,
      },
    },
    create: {
      roomId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
    },
    update: {
      userName: user.name,
      userRole: user.role,
      lastSeenAt: new Date(),
    },
  });
}

export async function createDiscussionRoom(
  user: SessionUser,
  input: {
    name: string;
    memberUserIds: string[];
  },
): Promise<DiscussionRoom> {
  assertAdmin(user);
  await ensureDatabaseConnected();

  const name = input.name.trim();

  if (!name) {
    throw new Error("Room name is required.");
  }

  const roomId = randomUUID();
  const memberUserIds = uniqueIds(input.memberUserIds);
  const [existingRoom, memberUsers] = await Promise.all([
    prisma.discussionRoom.findFirst({
      where: {
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
      select: { id: true },
    }),
    memberUserIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: memberUserIds } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  if (existingRoom) {
    throw new Error("A room with this name already exists.");
  }

  const validMemberIds = new Set(memberUsers.map((member) => member.id));
  const nextMemberUserIds = memberUserIds.filter((id) => validMemberIds.has(id));
  const createdRoom = await prisma.$transaction(async (tx) => {
    const room = await tx.discussionRoom.create({
      data: {
        id: roomId,
        name,
        createdByUserId: user.id,
      },
    });

    if (nextMemberUserIds.length > 0) {
      await tx.discussionRoomMember.createMany({
        data: nextMemberUserIds.map((userId) => ({ roomId, userId })),
      });
    }

    return room;
  }, DISCUSSION_TRANSACTION_OPTIONS);

  await createAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "discussion.room_created",
    targetType: "discussion-room",
    targetId: roomId,
    targetLabel: name,
  });

  return {
    id: createdRoom.id,
    name: createdRoom.name,
    memberUserIds: nextMemberUserIds,
    members: memberUsers,
    memberCount: nextMemberUserIds.length,
    activeUserIds: [],
    createdByUserId: createdRoom.createdByUserId ?? "",
    createdAt: createdRoom.createdAt.toISOString(),
    updatedAt: createdRoom.updatedAt.toISOString(),
    lastMessageAt: createdRoom.lastMessageAt.toISOString(),
  };
}

export async function updateDiscussionRoomMembers(
  user: SessionUser,
  roomId: string,
  memberUserIds: string[],
): Promise<DiscussionRoom> {
  assertAdmin(user);
  await ensureDatabaseConnected();

  const nextMemberUserIds = uniqueIds(memberUserIds);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "DiscussionRoomMember"
      WHERE "roomId" = ${roomId}
    `);

    if (nextMemberUserIds.length > 0) {
      const values = Prisma.join(
        nextMemberUserIds.map((memberUserId) => Prisma.sql`(${roomId}, ${memberUserId}, NOW())`),
      );

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "DiscussionRoomMember" ("roomId", "userId", "createdAt")
        VALUES ${values}
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "DiscussionRoom"
      SET "updatedAt" = NOW()
      WHERE "id" = ${roomId}
    `);
  }, DISCUSSION_TRANSACTION_OPTIONS);

  await createAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "discussion.room_members_updated",
    targetType: "discussion-room",
    targetId: roomId,
    metadata: { memberUserIds: nextMemberUserIds },
  });

  const rooms = await getDiscussionRoomsForUser(user);
  const room = rooms.find((item) => item.id === roomId);

  if (!room) {
    throw new Error("Unable to load the updated room.");
  }

  return room;
}

export async function deleteDiscussionRoom(user: SessionUser, roomId: string) {
  assertAdmin(user);
  await ensureDatabaseConnected();

  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "DiscussionRoom"
    WHERE "id" = ${roomId}
  `);

  await createAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "discussion.room_deleted",
    targetType: "discussion-room",
    targetId: roomId,
  });
}

export async function pruneDiscussionRoomPresence(): Promise<void> {
  await ensureDatabaseConnected();

  await prisma.discussionRoomPresence.deleteMany({
    where: {
      lastSeenAt: {
        lt: new Date(Date.now() - DISCUSSION_ROOM_PRESENCE_TTL_MS),
      },
    },
  });
}

export async function createDiscussionMessage(
  user: SessionUser,
  input: {
    roomId: string;
    content: string;
    attachments: DiscussionUploadAttachment[];
  },
): Promise<DiscussionMessage> {
  await assertDiscussionRoomAccess(user, input.roomId);
  await ensureDatabaseConnected();

  const content = input.content.trim();
  const attachments = input.attachments.filter(
    (attachment) =>
      attachment.name.trim() &&
      attachment.mimeType.trim() &&
      attachment.dataUrl.startsWith("data:"),
  );

  if (!content && attachments.length === 0) {
    throw new Error("Message content or attachments are required.");
  }

  const messageId = randomUUID();
  const createdAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "DiscussionMessage" (
        "id",
        "roomId",
        "userId",
        "userName",
        "content",
        "createdAt"
      )
      VALUES (
        ${messageId},
        ${input.roomId},
        ${user.id},
        ${user.name},
        ${content},
        ${createdAt}
      )
    `);

    if (attachments.length > 0) {
      const values = Prisma.join(
        attachments.map((attachment) =>
          Prisma.sql`(
            ${randomUUID()},
            ${messageId},
            ${attachment.name.trim()},
            ${attachment.mimeType.trim()},
            ${Math.max(0, Math.round(attachment.sizeBytes || 0))},
            ${attachment.dataUrl},
            ${createdAt}
          )`,
        ),
      );

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "DiscussionAttachment" (
          "id",
          "messageId",
          "name",
          "mimeType",
          "sizeBytes",
          "dataUrl",
          "createdAt"
        )
        VALUES ${values}
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "DiscussionRoom"
      SET "lastMessageAt" = ${createdAt}, "updatedAt" = NOW()
      WHERE "id" = ${input.roomId}
    `);
  }, DISCUSSION_TRANSACTION_OPTIONS);

  return {
    id: messageId,
    roomId: input.roomId,
    userId: user.id,
    userName: user.name,
    content,
    createdAt: createdAt.toISOString(),
    attachments: attachments.map((attachment) => ({
      id: randomUUID(),
      name: attachment.name.trim(),
      mimeType: attachment.mimeType.trim(),
      sizeBytes: Math.max(0, Math.round(attachment.sizeBytes || 0)),
      dataUrl: attachment.dataUrl,
      createdAt: createdAt.toISOString(),
    })),
  };
}

async function assertDiscussionRoomAccess(user: SessionUser, roomId: string) {
  await ensureDatabaseConnected();

  const rows =
    user.role === "admin"
      ? await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id"
          FROM "DiscussionRoom"
          WHERE "id" = ${roomId}
          LIMIT 1
        `)
      : await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT r."id"
          FROM "DiscussionRoom" r
          INNER JOIN "DiscussionRoomMember" m
            ON m."roomId" = r."id"
           AND m."userId" = ${user.id}
          WHERE r."id" = ${roomId}
          LIMIT 1
        `);

  if (rows.length === 0) {
    throw new Error("You do not have access to this discussion room.");
  }
}

function assertAdmin(user: SessionUser) {
  if (user.role !== "admin") {
    throw new Error("Only admins can manage discussion rooms.");
  }
}

function uniqueIds(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function mapDiscussionMessage(row: SqlMessageRow): DiscussionMessage {
  const rawAttachments = Array.isArray(row.attachments) ? row.attachments : [];

  return {
    id: row.id,
    roomId: row.roomId,
    userId: row.userId,
    userName: row.userName,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    attachments: rawAttachments.map((attachment) => mapDiscussionAttachment(attachment)),
  };
}

function mapDiscussionAttachment(value: unknown): DiscussionAttachment {
  const attachment = value as Partial<SqlAttachmentRow> & { createdAt?: string | Date };

  return {
    id: String(attachment.id ?? ""),
    name: String(attachment.name ?? ""),
    mimeType: String(attachment.mimeType ?? ""),
    sizeBytes: Number(attachment.sizeBytes ?? 0),
    dataUrl: String(attachment.dataUrl ?? ""),
    createdAt:
      attachment.createdAt instanceof Date
        ? attachment.createdAt.toISOString()
        : String(attachment.createdAt ?? ""),
  };
}
