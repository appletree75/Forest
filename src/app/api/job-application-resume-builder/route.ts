import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildTailoredResume } from "@/lib/resume-builder";

type BuildResumeRequest = {
  profileName?: string;
  jd?: string;
  baseResume?: string;
  instructions?: string;
};

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as BuildResumeRequest;
    const profileName = body.profileName?.trim() || "";
    const jd = body.jd?.trim() || "";
    const baseResume = body.baseResume?.trim() || "";
    const instructions = body.instructions?.trim() || "";

    if (!jd || !baseResume) {
      return NextResponse.json(
        { message: "JD and basic resume are required." },
        { status: 400 },
      );
    }

    const result = await buildTailoredResume({
      profileName,
      jd,
      baseResume,
      instructions,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to build resume.",
      },
      { status: 500 },
    );
  }
}
