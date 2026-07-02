import { NextResponse } from "next/server";

import { ensureDatabaseConnected } from "@/lib/database";
import { validateServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    const env = validateServerEnv();
    await ensureDatabaseConnected();
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      ok: true,
      checkedAt,
      environment: env.nodeEnv,
      database: "up",
      googleCalendarConfigured: env.googleCalendarConfigured,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        checkedAt,
        database: "down",
        message: error instanceof Error ? error.message : "Health check failed.",
      },
      { status: 503 },
    );
  }
}
