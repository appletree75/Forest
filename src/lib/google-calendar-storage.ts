import { randomUUID } from "node:crypto";

import { ensureDatabaseConnected } from "@/lib/database";
import { prisma } from "@/lib/prisma";

export type GoogleCalendarConnection = {
  id: string;
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  scope: string;
  calendarId: string;
  createdAt: string;
  updatedAt: string;
};

type GoogleCalendarEventLink = {
  connectionId: string;
  localEventId: string;
  externalEventId: string;
  createdAt: string;
  updatedAt: string;
};

function mapConnection(connection: {
  id: string;
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: bigint;
  scope: string;
  calendarId: string;
  createdAt: Date;
  updatedAt: Date;
}): GoogleCalendarConnection {
  return {
    id: connection.id,
    userId: connection.userId,
    email: connection.email,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    expiryDate: Number(connection.expiryDate),
    scope: connection.scope,
    calendarId: connection.calendarId,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

function mapLink(link: {
  connectionId: string;
  localEventId: string;
  externalEventId: string;
  createdAt: Date;
  updatedAt: Date;
}): GoogleCalendarEventLink {
  return {
    connectionId: link.connectionId,
    localEventId: link.localEventId,
    externalEventId: link.externalEventId,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  };
}

export async function getGoogleCalendarConnections(userId: string) {
  await ensureDatabaseConnected();

  const connections = await prisma.googleCalendarConnection.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return connections.map(mapConnection);
}

export async function getAllGoogleCalendarConnections() {
  await ensureDatabaseConnected();

  const connections = await prisma.googleCalendarConnection.findMany({
    orderBy: [{ userId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  return connections.map(mapConnection);
}

export async function upsertGoogleCalendarConnection(
  nextConnection: Omit<GoogleCalendarConnection, "id" | "createdAt" | "updatedAt">,
) {
  await ensureDatabaseConnected();

  const existing = await prisma.googleCalendarConnection.findUnique({
    where: {
      userId_email: {
        userId: nextConnection.userId,
        email: nextConnection.email.toLowerCase(),
      },
    },
  });

  if (existing) {
    const updated = await prisma.googleCalendarConnection.update({
      where: { id: existing.id },
      data: {
        accessToken: nextConnection.accessToken,
        refreshToken: nextConnection.refreshToken,
        expiryDate: BigInt(nextConnection.expiryDate),
        scope: nextConnection.scope,
        calendarId: nextConnection.calendarId,
      },
    });

    return mapConnection(updated);
  }

  const created = await prisma.googleCalendarConnection.create({
    data: {
      id: randomUUID(),
      userId: nextConnection.userId,
      email: nextConnection.email.toLowerCase(),
      accessToken: nextConnection.accessToken,
      refreshToken: nextConnection.refreshToken,
      expiryDate: BigInt(nextConnection.expiryDate),
      scope: nextConnection.scope,
      calendarId: nextConnection.calendarId,
    },
  });

  return mapConnection(created);
}

export async function deleteGoogleCalendarConnection(
  userId: string,
  connectionId: string,
) {
  await ensureDatabaseConnected();

  await prisma.googleCalendarConnection.deleteMany({
    where: {
      userId,
      id: connectionId,
    },
  });
}

export async function getGoogleCalendarEventLink(
  connectionId: string,
  localEventId: string,
) {
  await ensureDatabaseConnected();

  const link = await prisma.googleCalendarEventLink.findUnique({
    where: {
      connectionId_localEventId: {
        connectionId,
        localEventId,
      },
    },
  });

  return link ? mapLink(link) : null;
}

export async function upsertGoogleCalendarEventLink(
  connectionId: string,
  localEventId: string,
  externalEventId: string,
) {
  await ensureDatabaseConnected();

  await prisma.googleCalendarEventLink.upsert({
    where: {
      connectionId_localEventId: {
        connectionId,
        localEventId,
      },
    },
    create: {
      connectionId,
      localEventId,
      externalEventId,
    },
    update: {
      externalEventId,
    },
  });
}

export async function deleteGoogleCalendarEventLink(
  connectionId: string,
  localEventId: string,
) {
  await ensureDatabaseConnected();

  await prisma.googleCalendarEventLink.deleteMany({
    where: {
      connectionId,
      localEventId,
    },
  });
}
