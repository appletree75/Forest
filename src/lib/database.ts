import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

const settingsId = "global";

let connectionPromise: Promise<void> | null = null;

export async function ensureDatabaseConnected() {
  if (!connectionPromise) {
    connectionPromise = prisma.$connect();
  }

  try {
    await connectionPromise;
  } catch (error) {
    connectionPromise = null;
    throw error;
  }
}

export function getSettingsId() {
  return settingsId;
}

export function createSessionToken() {
  return randomUUID();
}
