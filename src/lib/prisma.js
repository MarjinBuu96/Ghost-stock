// src/lib/prisma.js
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // log: ["query", "error", "warn"], // enable while debugging if you want
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
