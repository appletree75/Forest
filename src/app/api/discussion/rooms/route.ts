import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import {
  createDiscussionRoom,
  getDiscussionRoomsForUser,
} from "@/lib/discussion";
import { isDatabaseUnavailable } from "@/lib/database";

export async function GET() {
  const user = await requireSession();

  try {
    const rooms = await getDiscussionRoomsForUser(user);
    return NextResponse.json({ rooms });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json({ rooms: [], degraded: true }, { status: 200 });
    }

    return NextResponse.json(
      { message: "Unable to load discussion rooms." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await requireSession();

  try {
    const body = (await request.json()) as {
      name?: string;
      memberUserIds?: string[];
    };

    const room = await createDiscussionRoom(user, {
      name: String(body.name ?? ""),
      memberUserIds: Array.isArray(body.memberUserIds) ? body.memberUserIds : [],
    });

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
      { message: "Unable to create discussion room." },
      { status: 500 },
    );
  }
}
