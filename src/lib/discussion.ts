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

type SqlRoomRow = {
  id: string;
  name: string;
  createdByUserId: string | null;
  memberUserIds: string[] | null;
  members: Prisma.JsonValue;
  memberCount: number | bigint;
  activeUserIds: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
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

export async function getDiscussionRoomsForUser(
  user: SessionUser,
): Promise<DiscussionRoom[]> {
  try {
    await ensureDatabaseConnected();
    await pruneDiscussionRoomPresence();

    const rows =
      user.role === "admin"
        ? await prisma.$queryRaw<SqlRoomRow[]>(Prisma.sql`
            SELECT
              r."id",
              r."name",
              r."createdByUserId",
              COALESCE((
                SELECT array_remove(array_agg(m."userId" ORDER BY u."name" ASC), NULL)
                FROM "DiscussionRoomMember" m
                INNER JOIN "User" u ON u."id" = m."userId"
                WHERE m."roomId" = r."id"
              ), ARRAY[]::text[]) AS "memberUserIds",
              COALESCE((
                SELECT json_agg(
                  json_build_object(
                    'id', u."id",
                    'name', u."name"
                  )
                  ORDER BY u."name" ASC
                )
                FROM "DiscussionRoomMember" m
                INNER JOIN "User" u ON u."id" = m."userId"
                WHERE m."roomId" = r."id"
              ), '[]'::json) AS "members",
              COALESCE((
                SELECT COUNT(*)::int
                FROM "DiscussionRoomMember" m
                WHERE m."roomId" = r."id"
              ), 0) AS "memberCount",
              COALESCE((
                SELECT array_remove(array_agg(p."userId" ORDER BY p."joinedAt" ASC), NULL)
                FROM "DiscussionRoomPresence" p
                WHERE p."roomId" = r."id"
                  AND p."lastSeenAt" >= ${new Date(Date.now() - DISCUSSION_ROOM_PRESENCE_TTL_MS)}
              ), ARRAY[]::text[]) AS "activeUserIds",
              r."createdAt",
              r."updatedAt",
              r."lastMessageAt"
            FROM "DiscussionRoom" r
            ORDER BY r."lastMessageAt" DESC, r."name" ASC
          `)
        : await prisma.$queryRaw<SqlRoomRow[]>(Prisma.sql`
            SELECT
              r."id",
              r."name",
              r."createdByUserId",
              COALESCE((
                SELECT array_remove(array_agg(m."userId" ORDER BY u."name" ASC), NULL)
                FROM "DiscussionRoomMember" m
                INNER JOIN "User" u ON u."id" = m."userId"
                WHERE m."roomId" = r."id"
              ), ARRAY[]::text[]) AS "memberUserIds",
              COALESCE((
                SELECT json_agg(
                  json_build_object(
                    'id', u."id",
                    'name', u."name"
                  )
                  ORDER BY u."name" ASC
                )
                FROM "DiscussionRoomMember" m
                INNER JOIN "User" u ON u."id" = m."userId"
                WHERE m."roomId" = r."id"
              ), '[]'::json) AS "members",
              COALESCE((
                SELECT COUNT(*)::int
                FROM "DiscussionRoomMember" m
                WHERE m."roomId" = r."id"
              ), 0) AS "memberCount",
              COALESCE((
                SELECT array_remove(array_agg(p."userId" ORDER BY p."joinedAt" ASC), NULL)
                FROM "DiscussionRoomPresence" p
                WHERE p."roomId" = r."id"
                  AND p."lastSeenAt" >= ${new Date(Date.now() - DISCUSSION_ROOM_PRESENCE_TTL_MS)}
              ), ARRAY[]::text[]) AS "activeUserIds",
              r."createdAt",
              r."updatedAt",
              r."lastMessageAt"
            FROM "DiscussionRoom" r
            INNER JOIN "DiscussionRoomMember" self_member
              ON self_member."roomId" = r."id"
             AND self_member."userId" = ${user.id}
            ORDER BY r."lastMessageAt" DESC, r."name" ASC
          `);

    return rows.map(mapDiscussionRoom);
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

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "DiscussionRoom" (
        "id",
        "name",
        "createdByUserId",
        "lastMessageAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${roomId},
        ${name},
        ${user.id},
        NOW(),
        NOW(),
        NOW()
      )
    `);

    if (memberUserIds.length > 0) {
      const values = Prisma.join(
        memberUserIds.map((memberUserId) => Prisma.sql`(${roomId}, ${memberUserId}, NOW())`),
      );

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "DiscussionRoomMember" ("roomId", "userId", "createdAt")
        VALUES ${values}
      `);
    }
  });

  await createAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "discussion.room_created",
    targetType: "discussion-room",
    targetId: roomId,
    targetLabel: name,
  });

  const rooms = await getDiscussionRoomsForUser(user);
  const room = rooms.find((item) => item.id === roomId);

  if (!room) {
    throw new Error("Unable to load the created room.");
  }

  return room;
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
  });

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
  });

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

function mapDiscussionRoom(row: SqlRoomRow): DiscussionRoom {
  return {
    id: row.id,
    name: row.name,
    memberUserIds: row.memberUserIds ?? [],
    members: mapDiscussionRoomMembers(row.members),
    memberCount: Number(row.memberCount ?? 0),
    activeUserIds: row.activeUserIds ?? [],
    createdByUserId: row.createdByUserId ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastMessageAt: row.lastMessageAt.toISOString(),
  };
}

function mapDiscussionRoomMembers(
  value: Prisma.JsonValue,
): Array<{ id: string; name: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const member = entry as { id?: unknown; name?: unknown };
      return {
        id: String(member.id ?? ""),
        name: String(member.name ?? ""),
      };
    })
    .filter((member) => member.id && member.name);
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
