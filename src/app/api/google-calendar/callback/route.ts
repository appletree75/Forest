import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { saveGoogleCalendarConnection } from "@/lib/google-calendar";

const GOOGLE_STATE_COOKIE = "nex_google_calendar_state";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const returnedState = url.searchParams.get("state") ?? "";
  const origin = url.origin;
  const cookieStore = await cookies();
  const rawState = cookieStore.get(GOOGLE_STATE_COOKIE)?.value ?? "";

  cookieStore.delete(GOOGLE_STATE_COOKIE);

  if (!code || !returnedState || !rawState) {
    return NextResponse.redirect(new URL("/interview?googleCalendar=error", origin));
  }

  try {
    const parsed = JSON.parse(rawState) as { state?: string; userId?: string };

    if (!parsed.state || !parsed.userId || parsed.state !== returnedState) {
      return NextResponse.redirect(new URL("/interview?googleCalendar=error", origin));
    }

    await saveGoogleCalendarConnection(parsed.userId, code, origin);
    return NextResponse.redirect(new URL("/interview?googleCalendar=connected", origin));
  } catch {
    return NextResponse.redirect(new URL("/interview?googleCalendar=error", origin));
  }
}
