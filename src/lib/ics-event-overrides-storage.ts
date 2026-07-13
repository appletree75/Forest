import {
  ensureDatabaseConnected,
  isDatabaseUnavailable,
} from "@/lib/database";
import { prisma } from "@/lib/prisma";
import type { ImportedCalendarEventOverride } from "@/lib/types";

function sanitizeStep(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric) || numeric < 1) {
    return 1;
  }

  return Math.round(numeric);
}

function mapOverride(override: {
  userId: string;
  eventId: string;
  title: string;
  start: string;
  end: string;
  color: string;
  hasLocalColorOverride: boolean;
  hasLocalTitleOverride: boolean;
  hasLocalScheduleOverride: boolean;
  callerUserId: string | null;
  meetingLink: string;
  jdLink: string;
  resumeLink: string;
  docLink: string;
  step: number;
  notes: string;
}) {
  return {
    userId: override.userId,
    id: override.eventId,
    title: override.title,
    start: override.start,
    end: override.end,
    color: override.color,
    hasLocalColorOverride: override.hasLocalColorOverride,
    hasLocalTitleOverride: override.hasLocalTitleOverride,
    hasLocalScheduleOverride: override.hasLocalScheduleOverride,
    callerUserId: override.callerUserId ?? "",
    meetingLink: override.meetingLink,
    jdLink: override.jdLink,
    resumeLink: override.resumeLink,
    docLink: override.docLink,
    step: sanitizeStep(override.step),
    notes: override.notes,
  } satisfies ImportedCalendarEventOverride;
}

export async function getIcsEventOverrides(userId: string) {
  try {
    await ensureDatabaseConnected();

    const overrides = await prisma.icsEventOverride.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    return overrides.map(mapOverride);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return [];
  }
}

export async function getAllIcsEventOverrides() {
  try {
    await ensureDatabaseConnected();

    const overrides = await prisma.icsEventOverride.findMany({
      orderBy: [{ userId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });

    return overrides.map(mapOverride);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return [];
  }
}

export async function upsertIcsEventOverride(
  userId: string,
  override: ImportedCalendarEventOverride,
) {
  await ensureDatabaseConnected();

  await prisma.icsEventOverride.upsert({
    where: {
      userId_eventId: {
        userId,
        eventId: override.id,
      },
    },
    create: {
      userId,
      eventId: override.id,
      title: override.title,
      start: override.start,
      end: override.end,
      color: sanitizeColor(override.color),
      hasLocalColorOverride: Boolean(override.hasLocalColorOverride),
      hasLocalTitleOverride: Boolean(override.hasLocalTitleOverride),
      hasLocalScheduleOverride: Boolean(override.hasLocalScheduleOverride),
      callerUserId: sanitizeOptionalString(override.callerUserId),
      meetingLink: String(override.meetingLink ?? "").trim(),
      jdLink: String(override.jdLink ?? "").trim(),
      resumeLink: String(override.resumeLink ?? "").trim(),
      docLink: String(override.docLink ?? "").trim(),
      step: sanitizeStep(override.step),
      notes: String(override.notes ?? "").trim(),
    },
    update: {
      title: override.title,
      start: override.start,
      end: override.end,
      color: sanitizeColor(override.color),
      hasLocalColorOverride: Boolean(override.hasLocalColorOverride),
      hasLocalTitleOverride: Boolean(override.hasLocalTitleOverride),
      hasLocalScheduleOverride: Boolean(override.hasLocalScheduleOverride),
      callerUserId: sanitizeOptionalString(override.callerUserId),
      meetingLink: String(override.meetingLink ?? "").trim(),
      jdLink: String(override.jdLink ?? "").trim(),
      resumeLink: String(override.resumeLink ?? "").trim(),
      docLink: String(override.docLink ?? "").trim(),
      step: sanitizeStep(override.step),
      notes: String(override.notes ?? "").trim(),
    },
  });
}

export async function deleteIcsEventOverride(userId: string, eventId: string) {
  await ensureDatabaseConnected();

  await prisma.icsEventOverride.deleteMany({
    where: {
      userId,
      eventId,
    },
  });
}

function sanitizeOptionalString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function sanitizeColor(value: unknown) {
  const normalized = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#7c9b7b";
}
