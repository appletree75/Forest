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

function toDetailedErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    const stackLine = error.stack
      ?.split("\n")
      .map((line) => line.trim())
      .find((line) => line && line !== error.message);

    return stackLine ? `${error.message}\n${stackLine}` : error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return fallbackMessage;
}

async function runFlowCvStep<T>(label: string, action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    const message = toDetailedErrorMessage(
      error,
      `${label} failed.`,
    );
    throw new Error(`${label} failed: ${message}`);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as FlowCvResumeRequest;
    const profileName = body.profileName?.trim() || "";
    const jd = body.jd?.trim() || "";
    const baseResume = body.baseResume?.trim() || "";
    const instructions = body.instructions?.trim() || "";
    const tailoredResume =
      body.tailoredResume?.trim() ||
      (await runFlowCvStep("Resume tailoring", () =>
        buildTailoredResume({
          profileName,
          jd,
          baseResume,
          instructions,
        }),
      ));

    const flowCvDraft = await runFlowCvStep("FlowCV draft build", async () =>
      buildFlowCvDraft({
        profileName,
        jd,
        tailoredResume,
        baseResume,
        instructions,
      }),
    );

    const flowCvResume = await runFlowCvStep("FlowCV resume create", () =>
      createFlowCvResumeFromDraft({
        draft: flowCvDraft,
        profileName,
      }),
    );

    if (!flowCvResume.resumeId?.trim()) {
      throw new Error("FlowCV did not return a valid resume id.");
    }

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
    console.error("job-application-flowcv POST failed", error);

    return NextResponse.json(
      {
        message: toDetailedErrorMessage(
          error,
          "Unable to create a FlowCV resume.",
        ),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
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

    const pdf = await runFlowCvStep("FlowCV PDF download", () =>
      downloadFlowCvResumePdf(resumeId),
    );

    return new NextResponse(pdf.buffer, {
      status: 200,
      headers: {
        "Content-Type": pdf.contentType || "application/pdf",
        "Content-Disposition":
          pdf.contentDisposition || `attachment; filename="${resumeId}.pdf"`,
      },
    });
  } catch (error) {
    console.error("job-application-flowcv GET failed", error);

    return NextResponse.json(
      {
        message: toDetailedErrorMessage(
          error,
          "Unable to download the FlowCV PDF.",
        ),
      },
      { status: 500 },
    );
  }
}
