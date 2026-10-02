import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const settingsId = "global";
const defaultConnectionTimeoutMs = 15000;

let connectionPromise: Promise<void> | null = null;

export class DatabaseConnectionTimeoutError extends Error {
  constructor(message = "Database connection timed out.") {
    super(message);
    this.name = "DatabaseConnectionTimeoutError";
  }
}

export async function ensureDatabaseConnected(
  timeoutMs = defaultConnectionTimeoutMs,
) {
  if (!connectionPromise) {
    const connectionAttempt = prisma.$connect();
    connectionPromise = connectionAttempt;
    void connectionAttempt.then(
      () => {
        if (connectionPromise === connectionAttempt) {
          connectionPromise = null;
        }
      },
      () => {
        if (connectionPromise === connectionAttempt) {
          connectionPromise = null;
        }
      },
    );
  }

  const activeConnection = connectionPromise;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      activeConnection,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new DatabaseConnectionTimeoutError());
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function getSettingsId() {
  return settingsId;
}

export function createSessionToken() {
  return randomUUID();
}

export function isDatabaseUnavailable(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P1001" ||
        error.code === "P1002" ||
        error.code === "P1008" ||
        error.code === "P2024" ||
        isTransientPrismaEngineError(error))) ||
    (error instanceof Prisma.PrismaClientUnknownRequestError &&
      isTransientPrismaEngineError(error)) ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof DatabaseConnectionTimeoutError
  );
}

function isTransientPrismaEngineError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("Engine is not yet connected") ||
      error.message.includes("Error in PostgreSQL connection") ||
      error.message.includes("Timed out during query execution"))
  );
}
