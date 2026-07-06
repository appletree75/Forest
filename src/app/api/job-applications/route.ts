import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  JobApplicationVersionConflictError,
  loadJobApplicationRows,
  saveJobApplicationRows,
  saveJobApplicationTables,
} from "@/lib/job-application-storage";
import { getVisibleProfilesForUser } from "@/lib/profiles";
import type { JobApplication, JobApplicationTables } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId")?.trim() ?? "";
    const dayKey = searchParams.get("dayKey")?.trim() ?? "";

    if (!profileId || !dayKey) {
      return NextResponse.json(
        { message: "profileId and dayKey are required." },
        { status: 400 },
      );
    }

    const visibleProfiles = await getVisibleProfilesForUser(sessionUser);

    if (!visibleProfiles.some((profile) => profile.id === profileId)) {
      return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    }

    const { rows, version } = await loadJobApplicationRows(profileId, dayKey);

    return NextResponse.json({ profileId, dayKey, rows, version });
  } catch {
    return NextResponse.json(
      { message: "Unable to load job application table." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as {
      tables?: JobApplicationTables;
      profileId?: string;
      dayKey?: string;
      rows?: JobApplication[];
      version?: number;
    };

    if (
      body.profileId &&
      body.dayKey &&
      Array.isArray(body.rows)
    ) {
      if (
        sessionUser.role === "bidder" &&
        isBidderTableLockedByServer(body.dayKey)
      ) {
        return NextResponse.json(
          { message: "Bidders cannot edit tables 2 days after the table day." },
          { status: 403 },
        );
      }

      const nextVersion = await saveJobApplicationRows(
        body.profileId,
        body.dayKey,
        body.rows,
        typeof body.version === "number" ? body.version : undefined,
      );
      return NextResponse.json({ ok: true, version: nextVersion });
    }

    if (!body.tables || typeof body.tables !== "object") {
      return NextResponse.json(
        { message: "Invalid tables payload." },
        { status: 400 },
      );
    }

    await saveJobApplicationTables(body.tables);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof JobApplicationVersionConflictError) {
      return NextResponse.json(
        {
          message: "This table was updated elsewhere. Please refresh the table.",
          code: "VERSION_CONFLICT",
          version: error.currentVersion,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: "Unable to save job application tables." },
      { status: 500 },
    );
  }
}

function isBidderTableLockedByServer(dayKey: string) {
  const tableDate = parseDayKey(dayKey);

  if (!tableDate) {
    return false;
  }

  const now = new Date();
  const serverToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const diffInDays = Math.floor(
    (serverToday.getTime() - tableDate.getTime()) / 86_400_000,
  );

  return diffInDays >= 2;
}

function parseDayKey(dayKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return null;
  }

  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
