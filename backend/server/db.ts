import { PrismaClient } from "@prisma/client";

/**
 * A single PrismaClient per process.
 *
 * Stashed on globalThis because Next's dev server re-evaluates modules on every
 * hot reload; without this each edit would open a fresh connection pool until
 * Postgres refused new connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
