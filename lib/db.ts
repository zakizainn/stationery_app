import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 tidak lagi punya query engine bawaan — koneksi database
// dijalankan lewat driver adapter (di sini: node-postgres / "pg").
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Singleton pattern — mencegah banyak instance Prisma Client saat hot-reload di dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
