import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { isDatabaseUnavailable } from "@/lib/database";
import {
  createInterviewRoomMessage,
  emptyInterviewRoomContext,
  getInterviewRoomState,
  parseInterviewRoomKey,
  touchInterviewRoomPresence,
  upsertInterviewRoomContext,
} from "@/lib/interview-room";
import { getSelectedApiKey } from "@/lib/ai-settings";

async function sendDeepSeekMessage(input: {
  prompt: string;
  roomLabel: string;
  userName: string;
  context: {
    resume: string;
    jd: string;
    details: string;
    reference: string;
  };
}) {
  const selectedKey = await getSelectedApiKey();

  if (!selectedKey?.apiKey) {
    throw new Error("No API key selected.");
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${selectedKey.apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `You are an AI interviewer speaking with recruiter interested in hiring candidate.

Your task is as follows:
Write a relevant answer for a question given to you.

Ensure your response follows these rules:
- Keep the summary to several paragraphs adjusting length depends on questions.
- Avoid bullet points or section headers.
- If technical Q/A, structure the answer - key answer, then explanation based on real experience of the profile

Follow these style and tone guidelines in your response:
- Use plain, everyday language
- Direct and confident
- Personal and human
- Avoid hype or promotional language
- Avoid deeply technical jargon
- No buzzwords like "transformative" or "game-changer"
- Avoid overly polished terms like "delves into", "showcasing", or "leverages"
- Avoid cliches like "in the realm of", "ushering in", or "a new era of"
- Don't use em dashes (-) or semicolons
- Favor short, clear sentences over long compound ones

Your goal is to achieve the following outcome:
Make recruiter decide whether this candidate is suitable for this position.`,
        },
        {
          role: "user",
          content: `Now perform the task as instructed above.

Here is the content you need to work with:

<<<BEGIN CONTENT>>>

Room: ${input.roomLabel}
Asked by: ${input.userName}

[RESUME]
${input.context.resume || "(empty)"}

[JD]
${input.context.jd || "(empty)"}

[DETAILS]
${input.context.details || "(empty)"}

[REFERENCE]
${input.context.reference || "(empty)"}

[QUESTION CONTENT]
${input.prompt}

<<<END CONTENT>>>`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("DeepSeek request failed.");
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  return payload.choices?.[0]?.message?.content?.trim() || "No response.";
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
  };
  const roomKey = body.roomKey?.trim() || "";

  if (!roomKey) {
    return NextResponse.json({ message: "Room key is required." }, { status: 400 });
  }

  try {
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
    };
    const roomKey = body.roomKey?.trim() || "";

    if (!roomKey) {
      return NextResponse.json({ message: "Room key is required." }, { status: 400 });
    }

    const context = await upsertInterviewRoomContext({
      roomKey,
      resume: body.resume ?? "",
      jd: body.jd ?? "",
      details: body.details ?? "",
      reference: body.reference ?? "",
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
      roomLabel?: string;
    };
    const roomKey = body.roomKey?.trim() || "";
    const channel = body.channel === "ai" ? "ai" : "team";
    const content = body.content?.trim() || "";
    const roomLabel = body.roomLabel?.trim() || "Interview room";

    if (!roomKey || !content) {
      return NextResponse.json(
        { message: "Room key and content are required." },
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
      roomKey,
      eventType: parsedRoom.eventType,
      eventId: parsedRoom.eventId,
      channel,
      role: "user",
      userId: user.id,
      userName: user.name,
      content,
    });

    let assistantMessage = null;

    if (channel === "ai") {
      const currentState = await getInterviewRoomState(roomKey);
      const aiResponse = await sendDeepSeekMessage({
        prompt: content,
        roomLabel,
        userName: user.name,
        context: currentState.context,
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
