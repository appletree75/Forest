import { randomUUID } from "node:crypto";

import { InterviewStatus as PrismaInterviewStatus } from "@prisma/client";

import {
  ensureDatabaseConnected,
  isDatabaseUnavailable,
} from "@/lib/database";
import { prisma } from "@/lib/prisma";
import type { InterviewEvent, InterviewStatus } from "@/lib/types";

const statusDefaultColors: Record<InterviewStatus, string> = {
  Scheduled: "#ffd86f",
  Confirmed: "#7dd3fc",
  Done: "#86efac",
  Cancelled: "#fda4af",
};

function mapInterview(event: {
  id: string;
  ownerUserId: string | null;
  bidderUserId: string | null;
  callerUserId: string | null;
  title: string;
  color: string;
  meetingLink: string;
  jdLink: string;
  resumeLink: string;
  docLink: string;
  step: number;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number;
  status: PrismaInterviewStatus;
  notes: string;
}): InterviewEvent {
  return {
    id: event.id,
    ownerUserId: event.ownerUserId ?? "",
    title: event.title,
    bidderUserId: event.bidderUserId ?? "",
    callerUserId: event.callerUserId ?? "",
    color: event.color,
    meetingLink: event.meetingLink,
    jdLink: event.jdLink,
    resumeLink: event.resumeLink,
    docLink: event.docLink,
    step: event.step,
    scheduledDate: event.scheduledDate,
    scheduledTime: event.scheduledTime,
    durationMinutes: event.durationMinutes,
    status: event.status,
    notes: event.notes,
  };
}

function toStoredInterview(input: InterviewEvent) {
  return {
    id: input.id,
    ownerUserId: sanitizeOptionalString(input.ownerUserId),
    bidderUserId: sanitizeOptionalString(input.bidderUserId),
    callerUserId: sanitizeOptionalString(input.callerUserId),
    title: String(input.title ?? "").trim(),
    color: sanitizeColor(input.color, input.status),
    meetingLink: String(input.meetingLink ?? "").trim(),
    jdLink: String(input.jdLink ?? "").trim(),
    resumeLink: String(input.resumeLink ?? "").trim(),
    docLink: String(input.docLink ?? "").trim(),
    step: sanitizeStep(input.step),
    scheduledDate: String(input.scheduledDate ?? "").trim(),
    scheduledTime: String(input.scheduledTime ?? "").trim(),
    durationMinutes: sanitizeDuration(input.durationMinutes),
    status: sanitizeStatus(input.status) as PrismaInterviewStatus,
    notes: String(input.notes ?? "").trim(),
  };
}

export async function getInterviewEvents() {
  try {
    await ensureDatabaseConnected();

    const events = await prisma.interview.findMany({
      orderBy: [
        { scheduledDate: "asc" },
        { scheduledTime: "asc" },
        { id: "asc" },
      ],
    });

    return events.map(mapInterview);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return [];
  }
}

export async function createInterviewEvent(input: Omit<InterviewEvent, "id">) {
  await ensureDatabaseConnected();

  const created = await prisma.interview.create({
    data: toStoredInterview({
      ...input,
      id: randomUUID(),
    }),
  });

  return mapInterview(created);
}

export async function updateInterviewEvent(
  id: string,
  input: Omit<InterviewEvent, "id">,
) {
  await ensureDatabaseConnected();

  const updated = await prisma.interview.update({
    where: { id },
    data: toStoredInterview({ ...input, id }),
  });

  return mapInterview(updated);
}

export async function getInterviewEventById(id: string) {
  await ensureDatabaseConnected();

  const event = await prisma.interview.findUnique({ where: { id } });
  return event ? mapInterview(event) : null;
}

export async function deleteInterviewEvent(id: string) {
  await ensureDatabaseConnected();
  await prisma.interview.delete({ where: { id } });
}

function sanitizeDuration(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 60;
  }

  return Math.round(numeric);
}

function sanitizeStep(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric) || numeric < 1) {
    return 1;
  }

  return Math.round(numeric);
}

function sanitizeStatus(value: unknown): InterviewStatus {
  const normalized = String(value ?? "").trim();

  if (
    normalized === "Scheduled" ||
    normalized === "Confirmed" ||
    normalized === "Done" ||
    normalized === "Cancelled"
  ) {
    return normalized;
  }

  return "Scheduled";
}

function sanitizeColor(value: unknown, status: unknown) {
  const normalized = String(value ?? "").trim();

  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized;
  }

  return statusDefaultColors[sanitizeStatus(status)];
}

function sanitizeOptionalString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
