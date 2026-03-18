import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

declare global {
    var __prisma: PrismaClient | undefined;
    var __prismaPool: Pool | undefined;
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

    const pool = globalThis.__prismaPool ?? new Pool({ connectionString: databaseUrl });
    if (process.env.NODE_ENV !== "production") {
        globalThis.__prismaPool = pool;
    }

    const adapter = new PrismaPg(pool);
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
