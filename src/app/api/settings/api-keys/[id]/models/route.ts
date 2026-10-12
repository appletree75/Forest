import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getAvailableModels } from "@/lib/ai-settings";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  try {
    const { id } = await context.params;
    const models = await getAvailableModels(id);
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load models." },
      { status: 500 },
    );
  }
}
