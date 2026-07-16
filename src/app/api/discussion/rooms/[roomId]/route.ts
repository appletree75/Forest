import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import {
  deleteDiscussionRoom,
  touchDiscussionRoomPresence,
  updateDiscussionRoomMembers,
} from "@/lib/discussion";
import { isDatabaseUnavailable } from "@/lib/database";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const user = await requireSession();
  const { roomId } = await context.params;

  try {
    const body = (await request.json()) as {
      action?: string;
      memberUserIds?: string[];
    };

    if (body.action === "touchPresence") {
      await touchDiscussionRoomPresence(user, roomId);
      return NextResponse.json({ ok: true });
    }

    const room = await updateDiscussionRoomMembers(
      user,
      roomId,
      Array.isArray(body.memberUserIds) ? body.memberUserIds : [],
    );

    return NextResponse.json({ room });
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
      { message: "Unable to update room members." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const user = await requireSession();
  const { roomId } = await context.params;

  try {
    await deleteDiscussionRoom(user, roomId);
    return NextResponse.json({ ok: true });
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
      { message: "Unable to delete discussion room." },
      { status: 500 },
    );
  }
}
