// src/lib/prisma.js
import { PrismaClient } from "@prisma/client";

// Reuse the client in dev to avoid exhausting DB connections on hot reloads
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma._prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma._prisma = prisma;
}

export { prisma };
