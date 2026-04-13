// file: lib/db.ts

import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Missing required environment variable: DATABASE_URL. " +
      "Please set DATABASE_URL before initializing the database client."
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
