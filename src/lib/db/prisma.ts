import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {
    var __prisma: PrismaClient | undefined;
}

function isSqliteUrl(url: string) {
    // Scheme-based: a postgres host may legitimately contain ".db" (e.g. k8s DNS),
    // so only the "file:" protocol means SQLite.
    return url.startsWith("file:");
}

function createPrismaClient() {
    const databaseUrl = process.env.DATABASE_URL ?? "file:./omnichat.db";

    if (isSqliteUrl(databaseUrl)) {
        const adapter = new PrismaLibSql({ url: databaseUrl });
        return new PrismaClient({ adapter });
    }

    // PostgreSQL (server deployments): driver adapter, same construction shape as SQLite.
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    return new PrismaClient({ adapter });
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
