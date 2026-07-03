import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import {
  deleteIcsEventOverride,
  upsertIcsEventOverride,
} from "@/lib/ics-event-overrides-storage";

export async function PUT(request: Request) {
  const user = await requireSession();

  try {
    const body = (await request.json()) as {
      id?: string;
      title?: string;
      start?: string;
      end?: string;
      hasLocalTitleOverride?: boolean;
      hasLocalScheduleOverride?: boolean;
      callerUserId?: string;
      meetingLink?: string;
      jdLink?: string;
      resumeLink?: string;
      docLink?: string;
      step?: number;
      notes?: string;
    };

    if (!body.id || !body.title || !body.start || !body.end) {
      return NextResponse.json(
        { message: "Event id, title, start, and end are required." },
        { status: 400 },
      );
    }

    await upsertIcsEventOverride(user.id, {
      id: body.id,
      title: body.title,
      start: body.start,
      end: body.end,
      hasLocalTitleOverride: Boolean(body.hasLocalTitleOverride),
      hasLocalScheduleOverride: Boolean(body.hasLocalScheduleOverride),
      callerUserId: String(body.callerUserId ?? ""),
      meetingLink: String(body.meetingLink ?? ""),
      jdLink: String(body.jdLink ?? ""),
      resumeLink: String(body.resumeLink ?? ""),
      docLink: String(body.docLink ?? ""),
      step: Number(body.step) || 0,
      notes: String(body.notes ?? ""),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: "Unable to update imported calendar event." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await requireSession();

  try {
    const body = (await request.json()) as { id?: string };

    if (!body.id) {
      return NextResponse.json(
        { message: "Imported event id is required." },
        { status: 400 },
      );
    }

    await deleteIcsEventOverride(user.id, body.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: "Unable to reset imported calendar event." },
      { status: 500 },
    );
  }
}
