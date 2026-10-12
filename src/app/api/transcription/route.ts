import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { isDatabaseUnavailable } from "@/lib/database";
import { getSelectedTranscriptionProvider } from "@/lib/transcription-settings";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
    const language = String(formData.get("language") ?? "en-US").trim();
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ message: "Audio is required." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { message: "Audio segment exceeds the 10 MB limit." },
        { status: 413 },
      );
    }

    const provider = await getSelectedTranscriptionProvider();
    if (!provider) {
      return NextResponse.json(
        { message: "Select an OpenAI key in Settings or configure a transcription provider in the AI room." },
        { status: 409 },
      );
    }

    const text =
      provider.provider === "openai"
        ? await transcribeWithOpenAi(audio, language, provider.apiKey, provider.model)
        : await transcribeWithDeepgram(audio, language, provider.apiKey, provider.model);

    return NextResponse.json({ ok: true, text, provider: provider.name });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { message: "Database is temporarily unavailable." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to transcribe audio.",
      },
      { status: 502 },
    );
  }
}

async function transcribeWithOpenAi(
  audio: File,
  language: string,
  apiKey: string,
  model: string,
) {
  const body = new FormData();
  body.append("file", audio, audio.name || "audio.webm");
  body.append("model", model || "gpt-4o-mini-transcribe");
  body.append("language", language.split("-")[0] || "en");

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
    },
  );
  const payload = (await response.json()) as { text?: string; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI transcription failed.");
  }
  return payload.text?.trim() || "";
}

async function transcribeWithDeepgram(
  audio: File,
  language: string,
  apiKey: string,
  model: string,
) {
  const query = new URLSearchParams({
    model: model || "nova-3",
    smart_format: "true",
    language: language || "en-US",
  });
  const response = await fetchWithTimeout(
    `https://api.deepgram.com/v1/listen?${query.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": audio.type || "audio/webm",
      },
      body: audio,
    },
  );
  const payload = (await response.json()) as {
    err_msg?: string;
    results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
  };
  if (!response.ok) {
    throw new Error(payload.err_msg || "Deepgram transcription failed.");
  }
  return payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || "";
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
