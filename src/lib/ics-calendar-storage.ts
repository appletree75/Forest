import { randomUUID } from "node:crypto";

import { ensureDatabaseConnected } from "@/lib/database";
import { prisma } from "@/lib/prisma";
import type { IcsCalendarSource } from "@/lib/types";

function mapSource(source: {
  id: string;
  ownerUserId: string;
  name: string;
  url: string;
  color: string;
}) {
  return {
    id: source.id,
    name: source.name,
    url: source.url,
    color: source.color,
    ownerUserId: source.ownerUserId,
  } satisfies IcsCalendarSource;
}

export async function getIcsCalendarSources(userId: string) {
  await ensureDatabaseConnected();

  const sources = await prisma.icsCalendarSource.findMany({
    where: { ownerUserId: userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return sources.map(mapSource);
}

export async function getAllIcsCalendarSources() {
  await ensureDatabaseConnected();

  const sources = await prisma.icsCalendarSource.findMany({
    orderBy: [{ ownerUserId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  return sources.map(mapSource);
}

export async function createIcsCalendarSource(
  userId: string,
  input: Omit<IcsCalendarSource, "id" | "ownerUserId" | "ownerName">,
) {
  await ensureDatabaseConnected();

  const created = await prisma.icsCalendarSource.create({
    data: {
      id: randomUUID(),
      ownerUserId: userId,
      name: input.name.trim(),
      url: input.url.trim(),
      color: input.color.trim() || "#7c9b7b",
    },
  });

  return mapSource(created);
}

export async function deleteIcsCalendarSource(userId: string, sourceId: string) {
  await ensureDatabaseConnected();

  await prisma.icsCalendarSource.deleteMany({
    where: {
      ownerUserId: userId,
      id: sourceId,
    },
  });
}
