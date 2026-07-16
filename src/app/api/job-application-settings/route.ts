import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { isDatabaseUnavailable } from "@/lib/database";
import {
  getJobApplicationStackOptions,
  setJobApplicationStackOptions,
} from "@/lib/job-application-settings";

export async function GET() {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const stacks = await getJobApplicationStackOptions();
    return NextResponse.json({ stacks });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { message: "Database is temporarily unavailable.", stacks: [] },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { message: "Unable to load job application settings." },
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

    const body = (await request.json()) as { stacks?: unknown };

    if (!Array.isArray(body.stacks)) {
      return NextResponse.json(
        { message: "Invalid stack settings payload." },
        { status: 400 },
      );
    }

    const stacks = await setJobApplicationStackOptions(body.stacks as string[]);
    return NextResponse.json({ ok: true, stacks });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { message: "Database is temporarily unavailable." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { message: "Unable to save job application settings." },
      { status: 500 },
    );
  }
}
