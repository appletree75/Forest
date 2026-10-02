import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaDatasourceUrl?: string;
};

const datasourceUrl = getDatabaseUrlWithTimeouts(process.env.DATABASE_URL);
const previousPrisma = globalForPrisma.prisma;

export const prisma =
  previousPrisma && globalForPrisma.prismaDatasourceUrl === datasourceUrl
    ? previousPrisma
    : new PrismaClient({
        log:
          process.env.NODE_ENV === "development"
            ? ["error", "warn"]
            : ["error"],
        datasourceUrl,
      });

if (process.env.NODE_ENV !== "production") {
  if (previousPrisma && previousPrisma !== prisma) {
    void previousPrisma.$disconnect().catch(() => undefined);
  }

  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaDatasourceUrl = datasourceUrl;
}

function getDatabaseUrlWithTimeouts(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    return undefined;
  }

  try {
    const url = new URL(databaseUrl);
    setDefaultParameter(url, "connection_limit", "5");
    setDefaultParameter(url, "connect_timeout", "15");
    setDefaultParameter(url, "pool_timeout", "15");
    setDefaultParameter(url, "socket_timeout", "20");
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

function setDefaultParameter(url: URL, name: string, value: string) {
  if (!url.searchParams.has(name)) {
    url.searchParams.set(name, value);
  }
}
