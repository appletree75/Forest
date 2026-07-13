import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { isDatabaseUnavailable } from "@/lib/database";
import {
  createIcsCalendarSource,
  deleteIcsCalendarSource,
} from "@/lib/ics-calendar-storage";

export async function POST(request: Request) {
  const user = await requireSession();

  try {
    const body = (await request.json()) as {
      name?: string;
      url?: string;
      color?: string;
    };

    if (!body.name?.trim() || !body.url?.trim()) {
      return NextResponse.json(
        { message: "Name and ICS URL are required." },
        { status: 400 },
      );
    }

    const source = await createIcsCalendarSource(user.id, {
      name: body.name.trim(),
      url: body.url.trim(),
      color: body.color?.trim() || "#7c9b7b",
    });

    return NextResponse.json({ ok: true, source });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { message: "Database is temporarily unavailable." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { message: "Unable to add ICS calendar." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await requireSession();

  try {
    const body = (await request.json()) as { sourceId?: string };

    if (!body.sourceId) {
      return NextResponse.json(
        { message: "Calendar source ID is required." },
        { status: 400 },
      );
    }

    await deleteIcsCalendarSource(user.id, body.sourceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { message: "Database is temporarily unavailable." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { message: "Unable to remove ICS calendar." },
      { status: 500 },
    );
  }
}
