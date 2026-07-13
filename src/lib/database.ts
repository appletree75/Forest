import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const settingsId = "global";
const defaultConnectionTimeoutMs = 2500;

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
    connectionPromise = prisma.$connect().finally(() => {
      connectionPromise = null;
    });
  }

  try {
    await Promise.race([
      connectionPromise,
      new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new DatabaseConnectionTimeoutError());
        }, timeoutMs);

        connectionPromise?.finally(() => {
          clearTimeout(timeoutId);
        });
      }),
    ]);
  } catch (error) {
    connectionPromise = null;
    await prisma.$disconnect().catch(() => undefined);
    throw error;
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
      (error.code === "P1001" || error.code === "P2024")) ||
    (error instanceof Prisma.PrismaClientUnknownRequestError &&
      isTransientPrismaEngineError(error)) ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof DatabaseConnectionTimeoutError
  );
}

function isTransientPrismaEngineError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    (error.message.includes("Engine is not yet connected") ||
      error.message.includes("Error in PostgreSQL connection"))
  );
}
