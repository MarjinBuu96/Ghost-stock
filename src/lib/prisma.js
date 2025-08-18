import { PrismaClient } from "@prisma/client";

// Prevent multiple instances in dev (Next hot reload)
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma || new PrismaClient({ log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
