import { NextResponse } from "next/server";

import { createAuditLog } from "@/lib/audit-log";
import { getSessionUser } from "@/lib/auth";
import { isDatabaseUnavailable } from "@/lib/database";
import {
  addTranscriptionProvider,
  getTranscriptionProviders,
  removeTranscriptionProvider,
  selectTranscriptionProvider,
} from "@/lib/transcription-settings";
import type { TranscriptionProvider } from "@/lib/types";

async function requireAdmin() {
  const user = await getSessionUser();
  return user?.role === "admin" ? user : null;
}

function isProvider(value: string): value is TranscriptionProvider {
  return value === "openai" || value === "deepgram";
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ message: "Admin access is required." }, { status: 403 });
  }

  try {
    return NextResponse.json({ providers: await getTranscriptionProviders() });
  } catch (error) {
    return providerErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ message: "Admin access is required." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      provider?: string;
      name?: string;
      apiKey?: string;
      model?: string;
    };
    const provider = body.provider?.trim().toLowerCase() || "";
    if (!isProvider(provider)) {
      return NextResponse.json(
        { message: "Choose OpenAI or Deepgram." },
        { status: 400 },
      );
    }

    const id = await addTranscriptionProvider({
      provider,
      name: body.name ?? "",
      apiKey: body.apiKey ?? "",
      model: body.model,
    });
    await createAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "transcription.provider_added",
      targetType: "transcription_provider",
      targetId: id,
      targetLabel: body.name?.trim() || provider,
      metadata: { provider },
    });

    return NextResponse.json({
      ok: true,
      providers: await getTranscriptionProviders(),
    });
  } catch (error) {
    return providerErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ message: "Admin access is required." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { id?: string };
    const id = body.id?.trim() || "";
    if (!id) {
      return NextResponse.json({ message: "Provider ID is required." }, { status: 400 });
    }

    await selectTranscriptionProvider(id);
    await createAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "transcription.provider_selected",
      targetType: "transcription_provider",
      targetId: id,
    });
    return NextResponse.json({
      ok: true,
      providers: await getTranscriptionProviders(),
    });
  } catch (error) {
    return providerErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ message: "Admin access is required." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { id?: string };
    const id = body.id?.trim() || "";
    if (!id) {
      return NextResponse.json({ message: "Provider ID is required." }, { status: 400 });
    }

    await removeTranscriptionProvider(id);
    await createAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "transcription.provider_removed",
      targetType: "transcription_provider",
      targetId: id,
    });
    return NextResponse.json({
      ok: true,
      providers: await getTranscriptionProviders(),
    });
  } catch (error) {
    return providerErrorResponse(error);
  }
}

function providerErrorResponse(error: unknown) {
  if (isDatabaseUnavailable(error)) {
    return NextResponse.json(
      { message: "Database is temporarily unavailable." },
      { status: 503 },
    );
  }
  return NextResponse.json(
    {
      message:
        error instanceof Error
          ? error.message
          : "Unable to manage transcription providers.",
    },
    { status: 500 },
  );
}
