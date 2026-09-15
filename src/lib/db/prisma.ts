import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

declare global {
    var __prisma: PrismaClient | undefined;
}

function isSqliteUrl(url: string) {
    return url.startsWith("file:") || url.includes(".db") || url.includes(".sqlite");
}

function createPrismaClient() {
    const databaseUrl = process.env.DATABASE_URL ?? "file:./omnichat.db";

    if (isSqliteUrl(databaseUrl)) {
        const adapter = new PrismaLibSql({ url: databaseUrl });
        return new PrismaClient({ adapter });
    }

    // For PostgreSQL, dynamically import to avoid bundling issues
    throw new Error("PostgreSQL adapter not configured. Please use SQLite for local development.");
}

const prismaClient = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalThis.__prisma = prismaClient;
}

export const prisma = prismaClient;

export async function getPrismaClient(): Promise<PrismaClient> {
    return prismaClient;
}

export * from "@prisma/client";
