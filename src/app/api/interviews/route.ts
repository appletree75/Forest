import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  deleteInterviewEventFromGoogleCalendar,
  syncInterviewEventToGoogleCalendar,
} from "@/lib/google-calendar";
import {
  createInterviewEvent,
  getInterviewEventById,
  deleteInterviewEvent,
  updateInterviewEvent,
} from "@/lib/interview-storage";
import type { InterviewEvent } from "@/lib/types";

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Omit<InterviewEvent, "id">;
    const event = await createInterviewEvent({
      ...body,
      ownerUserId: sessionUser.id,
    });
    await syncInterviewEventToGoogleCalendar(sessionUser.id, event);
    return NextResponse.json({ ok: true, event });
  } catch {
    return NextResponse.json(
      { message: "Unable to create interview event." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as InterviewEvent;
    const existingEvent = await getInterviewEventById(body.id);

    if (!existingEvent) {
      return NextResponse.json({ message: "Event not found." }, { status: 404 });
    }

    if (existingEvent.ownerUserId && existingEvent.ownerUserId !== sessionUser.id) {
      return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    }

    const event = await updateInterviewEvent(body.id, body);
    if (event) {
      await syncInterviewEventToGoogleCalendar(sessionUser.id, event);
    }
    return NextResponse.json({ ok: true, event });
  } catch {
    return NextResponse.json(
      { message: "Unable to update interview event." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { id?: string };

    if (!body.id) {
      return NextResponse.json({ message: "Event ID is required." }, { status: 400 });
    }

    const existingEvent = await getInterviewEventById(body.id);

    if (!existingEvent) {
      return NextResponse.json({ message: "Event not found." }, { status: 404 });
    }

    if (existingEvent.ownerUserId && existingEvent.ownerUserId !== sessionUser.id) {
      return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    }

    await deleteInterviewEvent(body.id);
    await deleteInterviewEventFromGoogleCalendar(sessionUser.id, body.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: "Unable to delete interview event." },
      { status: 500 },
    );
  }
}
