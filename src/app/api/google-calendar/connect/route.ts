import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import {
  buildGoogleAuthorizationUrl,
  createGoogleOauthState,
  isGoogleCalendarConfigured,
} from "@/lib/google-calendar";

const GOOGLE_STATE_COOKIE = "nex_google_calendar_state";

export async function GET(request: Request) {
  const user = await requireSession();
  const origin = new URL(request.url).origin;

  if (!isGoogleCalendarConfigured(origin)) {
    return NextResponse.redirect(new URL("/interview?googleCalendar=not-configured", origin));
  }

  const state = createGoogleOauthState();
  const cookieStore = await cookies();
  cookieStore.set(
    GOOGLE_STATE_COOKIE,
    JSON.stringify({ state, userId: user.id }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    },
  );

  return NextResponse.redirect(buildGoogleAuthorizationUrl(state, origin));
}
