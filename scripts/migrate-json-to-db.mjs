import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  ApplicationStatus,
  InterviewStatus,
  Platform,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();
const dataDir = join(process.cwd(), "data");

async function readJson(filename, fallback) {
  try {
    const raw = await readFile(join(dataDir, filename), "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function sanitizeOptionalString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function sanitizeInterviewStatus(value) {
  const normalized = String(value ?? "").trim();

  if (
    normalized === InterviewStatus.Scheduled ||
    normalized === InterviewStatus.Confirmed ||
    normalized === InterviewStatus.Done ||
    normalized === InterviewStatus.Cancelled
  ) {
    return normalized;
  }

  return InterviewStatus.Scheduled;
}

function sanitizePlatform(value) {
  const normalized = String(value ?? "").trim();

  if (
    normalized === Platform.Linkedin ||
    normalized === Platform.Indeed ||
    normalized === Platform.Jobright ||
    normalized === Platform.Dice
  ) {
    return normalized;
  }

  return Platform.Linkedin;
}

function sanitizeApplicationStatus(value) {
  const normalized = String(value ?? "").trim();

  if (normalized === ApplicationStatus.Applied || normalized === ApplicationStatus.Failed) {
    return normalized;
  }

  return null;
}

async function migrateInterviews() {
  const interviews = await readJson("interviews.json", []);
  const existingCount = await prisma.interview.count();

  if (existingCount > 0 || interviews.length === 0) {
    return;
  }

  await prisma.interview.createMany({
    data: interviews.map((interview) => ({
      id: String(interview.id),
      ownerUserId: sanitizeOptionalString(interview.ownerUserId),
      bidderUserId: sanitizeOptionalString(interview.bidderUserId),
      callerUserId: sanitizeOptionalString(interview.callerUserId),
      title: String(interview.title ?? "").trim(),
      color: String(interview.color ?? "#ffd86f").trim() || "#ffd86f",
      meetingLink: String(interview.meetingLink ?? "").trim(),
      resumeLink: String(interview.resumeLink ?? "").trim(),
      docLink: String(interview.docLink ?? "").trim(),
      step: Math.max(1, Number(interview.step) || 1),
      scheduledDate: String(interview.scheduledDate ?? "").trim(),
      scheduledTime: String(interview.scheduledTime ?? "").trim(),
      durationMinutes: Math.max(1, Number(interview.durationMinutes) || 60),
      status: sanitizeInterviewStatus(interview.status),
      notes: String(interview.notes ?? "").trim(),
    })),
    skipDuplicates: true,
  });
}

async function migrateIcsSources() {
  const payload = await readJson("ics-calendars.json", { sources: [] });
  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  const existingCount = await prisma.icsCalendarSource.count();

  if (existingCount > 0 || sources.length === 0) {
    return;
  }

  await prisma.icsCalendarSource.createMany({
    data: sources.map((source) => ({
      id: String(source.id),
      ownerUserId: String(source.userId ?? source.ownerUserId ?? "").trim(),
      name: String(source.name ?? "").trim(),
      url: String(source.url ?? "").trim(),
      color: String(source.color ?? "#7c9b7b").trim() || "#7c9b7b",
      createdAt: source.createdAt ? new Date(source.createdAt) : new Date(),
      updatedAt: source.updatedAt ? new Date(source.updatedAt) : new Date(),
    })),
    skipDuplicates: true,
  });
}

async function migrateIcsOverrides() {
  const payload = await readJson("ics-event-overrides.json", { overrides: [] });
  const overrides = Array.isArray(payload.overrides) ? payload.overrides : [];
  const existingCount = await prisma.icsEventOverride.count();

  if (existingCount > 0 || overrides.length === 0) {
    return;
  }

  await prisma.icsEventOverride.createMany({
    data: overrides
      .map((override) => {
        const userId = String(override.userId ?? "").trim();
        const eventId = String(override.id ?? override.eventId ?? "").trim();

        if (!userId || !eventId) {
          return null;
        }

        return {
          userId,
          eventId,
          title: String(override.title ?? "").trim(),
          start: String(override.start ?? "").trim(),
          end: String(override.end ?? "").trim(),
          hasLocalTitleOverride: Boolean(override.hasLocalTitleOverride),
          hasLocalScheduleOverride: Boolean(override.hasLocalScheduleOverride),
          callerUserId: sanitizeOptionalString(override.callerUserId),
          meetingLink: String(override.meetingLink ?? "").trim(),
          resumeLink: String(override.resumeLink ?? "").trim(),
          docLink: String(override.docLink ?? "").trim(),
          step: Math.max(1, Number(override.step) || 1),
          notes: String(override.notes ?? "").trim(),
          createdAt: override.createdAt ? new Date(override.createdAt) : new Date(),
          updatedAt: override.updatedAt ? new Date(override.updatedAt) : new Date(),
        };
      })
      .filter(Boolean),
    skipDuplicates: true,
  });
}

async function migrateGoogleCalendar() {
  const payload = await readJson("google-calendar.json", {
    connections: [],
    links: [],
  });
  const connections = Array.isArray(payload.connections) ? payload.connections : [];
  const links = Array.isArray(payload.links) ? payload.links : [];
  const existingConnectionCount = await prisma.googleCalendarConnection.count();
  const existingLinkCount = await prisma.googleCalendarEventLink.count();

  if (existingConnectionCount === 0 && connections.length > 0) {
    await prisma.googleCalendarConnection.createMany({
      data: connections.map((connection) => ({
        id: String(connection.id),
        userId: String(connection.userId ?? "").trim(),
        email: String(connection.email ?? "").trim().toLowerCase(),
        accessToken: String(connection.accessToken ?? "").trim(),
        refreshToken: String(connection.refreshToken ?? "").trim(),
        expiryDate: BigInt(Number(connection.expiryDate) || 0),
        scope: String(connection.scope ?? "").trim(),
        calendarId: String(connection.calendarId ?? "primary").trim() || "primary",
        createdAt: connection.createdAt ? new Date(connection.createdAt) : new Date(),
        updatedAt: connection.updatedAt ? new Date(connection.updatedAt) : new Date(),
      })),
      skipDuplicates: true,
    });
  }

  if (existingLinkCount === 0 && links.length > 0) {
    await prisma.googleCalendarEventLink.createMany({
      data: links
        .map((link) => {
          const connectionId = String(link.connectionId ?? "").trim();
          const localEventId = String(link.localEventId ?? "").trim();

          if (!connectionId || !localEventId) {
            return null;
          }

          return {
            connectionId,
            localEventId,
            externalEventId: String(link.externalEventId ?? "").trim(),
            createdAt: link.createdAt ? new Date(link.createdAt) : new Date(),
            updatedAt: link.updatedAt ? new Date(link.updatedAt) : new Date(),
          };
        })
        .filter(Boolean),
      skipDuplicates: true,
    });
  }
}

async function migrateFinance() {
  const payload = await readJson("finance-transactions.json", { transactions: [] });
  const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
  const existingCount = await prisma.financeTransaction.count();

  if (existingCount > 0 || transactions.length === 0) {
    return;
  }

  await prisma.financeTransaction.createMany({
    data: transactions.map((transaction) => ({
      id: String(transaction.id),
      to: String(transaction.to ?? "").trim(),
      amount: Math.max(0, Number(transaction.amount) || 0),
      date: String(transaction.date ?? "").trim(),
      note: String(transaction.note ?? "").trim(),
      createdAt: transaction.createdAt ? new Date(transaction.createdAt) : new Date(),
    })),
    skipDuplicates: true,
  });
}

async function migrateLegacyJobApplications() {
  const payload = await readJson("job-application-tables.json", {});
  const existingCount = await prisma.jobApplicationRow.count();

  if (existingCount > 0) {
    return;
  }
  const records = [];

  for (const [profileId, days] of Object.entries(payload ?? {})) {
    for (const [dayKey, rows] of Object.entries(days ?? {})) {
      if (!Array.isArray(rows)) {
        continue;
      }

      for (const row of rows) {
        records.push({
          profileId,
          dayKey,
          rowId: Number(row.id),
          platform: sanitizePlatform(row.platform),
          company: String(row.company ?? "").trim(),
          description: String(row.description ?? "").trim(),
          url: String(row.url ?? "").trim(),
          stack: String(row.stack ?? "").trim(),
          status: sanitizeApplicationStatus(row.status),
        });
      }
    }
  }

  if (records.length > 0) {
    await prisma.jobApplicationRow.createMany({
      data: records,
      skipDuplicates: true,
    });
  }
}

async function main() {
  await prisma.$connect();
  await migrateInterviews();
  await migrateIcsSources();
  await migrateIcsOverrides();
  await migrateGoogleCalendar();
  await migrateFinance();
  await migrateLegacyJobApplications();
  console.log("Legacy JSON data imported into PostgreSQL.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
