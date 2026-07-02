import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { revokeGoogleCalendarConnection } from "@/lib/google-calendar";

export async function POST(request: Request) {
  const user = await requireSession();

  try {
    const body = (await request.json()) as { connectionId?: string };

    if (!body.connectionId) {
      return NextResponse.json(
        { message: "Connection ID is required." },
        { status: 400 },
      );
    }

    await revokeGoogleCalendarConnection(user.id, body.connectionId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { message: "Unable to disconnect Google Calendar." },
      { status: 500 },
    );
  }
}
