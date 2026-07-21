import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  buildFlowCvDraft,
  createFlowCvResumeFromDraft,
  downloadFlowCvResumePdf,
} from "@/lib/flowcv";
import { buildTailoredResume } from "@/lib/resume-builder";

type FlowCvResumeRequest = {
  profileName?: string;
  jd?: string;
  baseResume?: string;
  instructions?: string;
  tailoredResume?: string;
};

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as FlowCvResumeRequest;
    const profileName = body.profileName?.trim() || "";
    const jd = body.jd?.trim() || "";
    const baseResume = body.baseResume?.trim() || "";
    const instructions = body.instructions?.trim() || "";
    const tailoredResume =
      body.tailoredResume?.trim() ||
      (await buildTailoredResume({
        profileName,
        jd,
        baseResume,
        instructions,
      }));

    const flowCvDraft = buildFlowCvDraft({
      profileName,
      jd,
      tailoredResume,
      baseResume,
      instructions,
    });

    const flowCvResume = await createFlowCvResumeFromDraft({
      draft: flowCvDraft,
      profileName,
    });

    return NextResponse.json({
      ok: true,
      result: tailoredResume,
      flowCvDraft,
      resumeId: flowCvResume.resumeId,
      openUrl: flowCvResume.openUrl,
      previewUrl: flowCvResume.previewUrl,
      downloadUrl: `/api/job-application-flowcv?resumeId=${encodeURIComponent(flowCvResume.resumeId)}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to create a FlowCV resume.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const resumeId = searchParams.get("resumeId")?.trim() || "";

  if (!resumeId) {
    return NextResponse.json(
      { message: "resumeId is required." },
      { status: 400 },
    );
  }

  try {
    const pdf = await downloadFlowCvResumePdf(resumeId);

    return new NextResponse(pdf.buffer, {
      status: 200,
      headers: {
        "Content-Type": pdf.contentType || "application/pdf",
        "Content-Disposition":
          pdf.contentDisposition || `attachment; filename="${resumeId}.pdf"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to download the FlowCV PDF.",
      },
      { status: 500 },
    );
  }
}
