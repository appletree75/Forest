import { ApplicationStatus, Platform } from "@prisma/client";

import { createInitialRows } from "@/lib/job-applications";
import { ensureDatabaseConnected } from "@/lib/database";
import { prisma } from "@/lib/prisma";
import type {
  JobApplication,
  JobApplicationTables,
  PersonalProfile,
} from "@/lib/types";

function fromStoredRow(row: {
  rowId: number;
  platform: Platform;
  company: string;
  description: string;
  url: string;
  stack: string;
  status: ApplicationStatus | null;
}): JobApplication {
  return {
    id: row.rowId,
    platform: row.platform,
    company: row.company,
    description: row.description,
    url: row.url,
    stack: row.stack as JobApplication["stack"],
    status: (row.status ?? "") as JobApplication["status"],
  };
}

function toStoredStatus(status: JobApplication["status"]) {
  if (!status) {
    return null;
  }

  return status as ApplicationStatus;
}

export async function loadJobApplicationTables(): Promise<JobApplicationTables> {
  await ensureDatabaseConnected();

  const rows = await prisma.jobApplicationRow.findMany({
    orderBy: [{ profileId: "asc" }, { dayKey: "asc" }, { rowId: "asc" }],
  });

  return rows.reduce<JobApplicationTables>((acc, row) => {
    acc[row.profileId] ??= {};
    acc[row.profileId][row.dayKey] ??= [];
    acc[row.profileId][row.dayKey].push(fromStoredRow(row));
    return acc;
  }, {});
}

export async function saveJobApplicationTables(tables: JobApplicationTables) {
  await ensureDatabaseConnected();

  const records = Object.entries(tables).flatMap(([profileId, days]) =>
    Object.entries(days).flatMap(([dayKey, rows]) =>
      rows.map((row) => ({
        profileId,
        dayKey,
        rowId: row.id,
        platform: row.platform as Platform,
        company: row.company,
        description: row.description,
        url: row.url,
        stack: row.stack,
        status: toStoredStatus(row.status),
      })),
    ),
  );

  await prisma.$transaction([
    prisma.jobApplicationRow.deleteMany(),
    ...(records.length > 0
      ? [
          prisma.jobApplicationRow.createMany({
            data: records,
          }),
        ]
      : []),
  ]);
}

export async function saveJobApplicationRows(
  profileId: string,
  dayKey: string,
  rows: JobApplication[],
) {
  await ensureDatabaseConnected();

  await prisma.$transaction([
    prisma.jobApplicationRow.deleteMany({
      where: {
        profileId,
        dayKey,
      },
    }),
    ...(rows.length > 0
      ? [
          prisma.jobApplicationRow.createMany({
            data: rows.map((row) => ({
              profileId,
              dayKey,
              rowId: row.id,
              platform: row.platform as Platform,
              company: row.company,
              description: row.description,
              url: row.url,
              stack: row.stack,
              status: toStoredStatus(row.status),
            })),
          }),
        ]
      : []),
  ]);
}

export async function getJobApplicationTablesForProfiles(
  profiles: PersonalProfile[],
  dayKey: string,
) {
  await ensureDatabaseConnected();

  const profileIds = profiles.map((profile) => profile.id);
  const storedRows = profileIds.length
    ? await prisma.jobApplicationRow.findMany({
        where: {
          profileId: {
            in: profileIds,
          },
        },
        orderBy: [{ profileId: "asc" }, { dayKey: "asc" }, { rowId: "asc" }],
      })
    : [];

  const grouped = storedRows.reduce<JobApplicationTables>((acc, row) => {
    acc[row.profileId] ??= {};
    acc[row.profileId][row.dayKey] ??= [];
    acc[row.profileId][row.dayKey].push(fromStoredRow(row));
    return acc;
  }, {});

  return Object.fromEntries(
    profiles.map((profile) => [
      profile.id,
      {
        ...grouped[profile.id],
        [dayKey]:
          grouped[profile.id]?.[dayKey] ??
          createInitialRows().map((row) => ({ ...row })),
      },
    ]),
  ) as JobApplicationTables;
}
