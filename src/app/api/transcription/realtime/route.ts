import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getSelectedTranscriptionProvider } from "@/lib/transcription-settings";

export async function POST() {
  if (!(await getSessionUser())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const provider = await getSelectedTranscriptionProvider();
    if (!provider || provider.provider !== "openai") {
      return NextResponse.json({ enabled: false });
    }

    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "transcription",
          audio: {
            input: {
              transcription: { model: "gpt-live-transcribe", delay: "low" },
              turn_detection: null,
            },
          },
        },
      }),
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      value?: string;
      error?: { message?: string };
    };
    if (!response.ok || !payload.value) {
      return NextResponse.json(
        { message: payload.error?.message || "Live transcription is unavailable." },
        { status: 502 },
      );
    }
    return NextResponse.json({ enabled: true, token: payload.value });
  } catch {
    return NextResponse.json({ message: "Live transcription is unavailable." }, { status: 503 });
  }
}
