import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { isDatabaseUnavailable } from "@/lib/database";
import {
  createInterviewRoomMessage,
  emptyInterviewRoomContext,
  getInterviewRoomState,
  parseInterviewRoomKey,
  removeInterviewRoomPresence,
  touchInterviewRoomPresence,
  updateInterviewRoomSharedNote,
  upsertInterviewRoomContext,
} from "@/lib/interview-room";
import { createAiChatCompletion } from "@/lib/ai-chat";
import { createAiImageGeneration } from "@/lib/ai-image";

const AI_HISTORY_MAX_MESSAGES = 40;
const AI_HISTORY_MAX_CHARS = 24_000;

async function sendAiMessage(input: {
  prompt: string;
  roomLabel: string;
  userName: string;
  context: {
    resume: string;
    jd: string;
    details: string;
    reference: string;
    aiPrompt: string;
  };
  history: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const systemContent = `${input.context.aiPrompt}

You are chatting in an interview room. Use prior messages in this conversation as context, just like a normal chat assistant.

Room: ${input.roomLabel}
Current user: ${input.userName}

[RESUME]
${input.context.resume || "(empty)"}

[JD]
${input.context.jd || "(empty)"}

[DETAILS]
${input.context.details || "(empty)"}

[REFERENCE]
${input.context.reference || "(empty)"}`;

  return createAiChatCompletion({
    maxTokens: 800,
    messages: [
      {
        role: "system",
        content: systemContent,
      },
      ...input.history,
      {
        role: "user",
        content: input.prompt,
      },
    ],
  });
}

function buildAiChatHistory(
  messages: Array<{ id: string; channel: string; role: string; content: string }>,
  excludeMessageId?: string,
) {
  const aiMessages = messages.filter(
    (message) =>
      message.channel === "ai" &&
      (message.role === "user" || message.role === "assistant") &&
      message.id !== excludeMessageId &&
      message.content.trim(),
  );

  const selected: Array<{ role: "user" | "assistant"; content: string }> = [];
  let totalChars = 0;

  for (let index = aiMessages.length - 1; index >= 0; index -= 1) {
    const message = aiMessages[index];
    const content = message.content.trim();
    if (!content) {
      continue;
    }
    if (
      selected.length >= AI_HISTORY_MAX_MESSAGES ||
      totalChars + content.length > AI_HISTORY_MAX_CHARS
    ) {
      break;
    }
    selected.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content,
    });
    totalChars += content.length;
  }

  return selected.reverse();
}

export async function GET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const roomKey = searchParams.get("roomKey")?.trim() || "";

  if (!roomKey) {
    return NextResponse.json({ message: "Room key is required." }, { status: 400 });
  }

  try {
    const state = await getInterviewRoomState(roomKey);
    return NextResponse.json({ ok: true, degraded: false, ...state });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      degraded: true,
      presence: [],
      messages: [],
      context: emptyInterviewRoomContext(roomKey),
    });
  }
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as {
    roomKey?: string;
    sharedNote?: string;
  };
  const roomKey = body.roomKey?.trim() || "";

  if (!roomKey) {
    return NextResponse.json({ message: "Room key is required." }, { status: 400 });
  }

  try {
    if (typeof body.sharedNote === "string") {
      const context = await updateInterviewRoomSharedNote({
        roomKey,
        sharedNote: body.sharedNote,
        updatedBy: user.name,
      });

      return NextResponse.json({ ok: true, degraded: false, context });
    }

    await touchInterviewRoomPresence({
      roomKey,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
    });

    return NextResponse.json({ ok: true, degraded: false });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return NextResponse.json({ ok: false, degraded: true });
  }
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as { roomKey?: string };
  const roomKey = body.roomKey?.trim() || "";

  if (!roomKey) {
    return NextResponse.json({ message: "Room key is required." }, { status: 400 });
  }

  try {
    await removeInterviewRoomPresence(roomKey, user.id);
    return NextResponse.json({ ok: true, degraded: false });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return NextResponse.json({ ok: false, degraded: true }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      roomKey?: string;
      resume?: string;
      jd?: string;
      details?: string;
      reference?: string;
      aiPrompt?: string;
    };
    const roomKey = body.roomKey?.trim() || "";

    if (!roomKey) {
      return NextResponse.json({ message: "Room key is required." }, { status: 400 });
    }

    if (body.aiPrompt !== undefined && user.role !== "admin") {
      return NextResponse.json(
        { message: "Only an admin can modify the AI prompt." },
        { status: 403 },
      );
    }

    if (
      body.aiPrompt !== undefined &&
      (typeof body.aiPrompt !== "string" || body.aiPrompt.length > 100_000)
    ) {
      return NextResponse.json(
        { message: "AI prompt must be text under 100,000 characters." },
        { status: 400 },
      );
    }

    const context = await upsertInterviewRoomContext({
      roomKey,
      resume: body.resume ?? "",
      jd: body.jd ?? "",
      details: body.details ?? "",
      reference: body.reference ?? "",
      aiPrompt: user.role === "admin" ? body.aiPrompt : undefined,
      updatedBy: user.name,
    });

    return NextResponse.json({ ok: true, context });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        {
          message: "Database is temporarily unavailable. Try again in a moment.",
          degraded: true,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to save AI room context.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      roomKey?: string;
      channel?: "team" | "ai";
      content?: string;
      clientMessageId?: string;
      roomLabel?: string;
      generateImage?: boolean;
      attachments?: Array<{
        name?: string;
        mimeType?: string;
        sizeBytes?: number;
        dataUrl?: string;
      }>;
    };
    const roomKey = body.roomKey?.trim() || "";
    const channel = body.channel === "ai" ? "ai" : "team";
    const content = body.content?.trim() || "";
    const generateImage = channel === "ai" && body.generateImage === true;
    const clientMessageId = typeof body.clientMessageId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.clientMessageId)
      ? body.clientMessageId
      : undefined;
    const roomLabel = body.roomLabel?.trim() || "Interview room";
    const attachments = Array.isArray(body.attachments)
      ? body.attachments.slice(0, 8).map((attachment) => ({
          name: String(attachment.name ?? "").trim(),
          mimeType: String(attachment.mimeType ?? "application/octet-stream").trim(),
          sizeBytes: Number(attachment.sizeBytes ?? 0),
          dataUrl: String(attachment.dataUrl ?? ""),
        }))
      : [];

    if (!roomKey || (!content && attachments.length === 0)) {
      return NextResponse.json(
        { message: "Room key and message content or attachments are required." },
        { status: 400 },
      );
    }

    if (channel === "ai" && attachments.length > 0) {
      return NextResponse.json(
        { message: "Attachments are available in Team Chat only." },
        { status: 400 },
      );
    }

    if (generateImage && !content) {
      return NextResponse.json(
        { message: "Describe the image you want to generate." },
        { status: 400 },
      );
    }

    const parsedRoom = parseInterviewRoomKey(roomKey);

    await touchInterviewRoomPresence({
      roomKey,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
    });

    const postedMessage = await createInterviewRoomMessage({
      id: clientMessageId,
      roomKey,
      eventType: parsedRoom.eventType,
      eventId: parsedRoom.eventId,
      channel,
      role: "user",
      userId: user.id,
      userName: user.name,
      content,
      attachments,
    });

    let assistantMessage = null;

    if (channel === "ai") {
      if (generateImage) {
        const image = await createAiImageGeneration({ prompt: content });
        assistantMessage = await createInterviewRoomMessage({
          roomKey,
          eventType: parsedRoom.eventType,
          eventId: parsedRoom.eventId,
          channel: "ai",
          role: "assistant",
          userName: "Nex AI",
          content: image.revisedPrompt
            ? `Generated image.\n\nRevised prompt: ${image.revisedPrompt}`
            : "Generated image.",
          attachments: [
            {
              name: image.name,
              mimeType: image.mimeType,
              sizeBytes: image.sizeBytes,
              dataUrl: image.dataUrl,
            },
          ],
        });
      } else {
        const currentState = await getInterviewRoomState(roomKey);
        const aiResponse = await sendAiMessage({
          prompt: content,
          roomLabel,
          userName: user.name,
          context: currentState.context,
          history: buildAiChatHistory(currentState.messages, postedMessage.id),
        });

        assistantMessage = await createInterviewRoomMessage({
          roomKey,
          eventType: parsedRoom.eventType,
          eventId: parsedRoom.eventId,
          channel: "ai",
          role: "assistant",
          userName: "Nex AI",
          content: aiResponse,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      postedMessage,
      assistantMessage,
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        {
          message: "Database is temporarily unavailable. Try again in a moment.",
          degraded: true,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to post message.",
      },
      { status: 500 },
    );
  }
}
