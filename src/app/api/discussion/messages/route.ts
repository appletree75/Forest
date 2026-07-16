import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import {
  createDiscussionMessage,
  getDiscussionMessagesForUser,
} from "@/lib/discussion";
import { isDatabaseUnavailable } from "@/lib/database";

export async function GET(request: Request) {
  const user = await requireSession();

  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId") ?? "";

    if (!roomId) {
      return NextResponse.json(
        { message: "roomId is required." },
        { status: 400 },
      );
    }

    const messages = await getDiscussionMessagesForUser(user, roomId);
    return NextResponse.json({ messages });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json({ messages: [], degraded: true }, { status: 200 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { message: "Unable to load discussion messages." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await requireSession();

  try {
    const body = (await request.json()) as {
      roomId?: string;
      content?: string;
      attachments?: Array<{
        name?: string;
        mimeType?: string;
        sizeBytes?: number;
        dataUrl?: string;
      }>;
    };

    const message = await createDiscussionMessage(user, {
      roomId: String(body.roomId ?? ""),
      content: String(body.content ?? ""),
      attachments: Array.isArray(body.attachments)
        ? body.attachments.map((attachment) => ({
            name: String(attachment.name ?? ""),
            mimeType: String(attachment.mimeType ?? ""),
            sizeBytes: Number(attachment.sizeBytes ?? 0),
            dataUrl: String(attachment.dataUrl ?? ""),
          }))
        : [],
    });

    return NextResponse.json({ message });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { message: "Database is temporarily unavailable." },
        { status: 503 },
      );
    }

    if (error instanceof Error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { message: "Unable to send discussion message." },
      { status: 500 },
    );
  }
}
