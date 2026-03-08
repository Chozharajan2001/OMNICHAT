// src/lib/db/prisma.ts
// ────────────────────────────────────────────────────────────────
// Prisma client singleton with database detection.
// Automatically detects SQLite vs PostgreSQL based on DATABASE_URL.
// ────────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

declare global {
    var prisma: PrismaClient | undefined;
}

/**
 * Detects database type from DATABASE_URL
 */
function getDatabaseType(): "sqlite" | "postgresql" {
    const dbUrl = process.env.DATABASE_URL || "";
    if (
        dbUrl.startsWith("file:") ||
        dbUrl.includes(".db") ||
        dbUrl.includes(".sqlite")
    ) {
        return "sqlite";
    }
    return "postgresql";
}

/**
 * Creates PrismaClient with appropriate adapter
 */
async function createPrismaClient(): Promise<PrismaClient> {
    const dbType = getDatabaseType();

    if (dbType === "sqlite") {
        // Use libsql adapter for SQLite (better Tauri support)
        const { PrismaLibSql } = await import("@prisma/adapter-libsql");

        const dbUrl = process.env.DATABASE_URL || "file:./omnichat.db";
        const adapter = new PrismaLibSql({
            url: dbUrl.replace("file:", "file://").replace(/^file:\/\//, ""),
        });

        return new PrismaClient({ adapter });
    } else {
        // Use PostgreSQL adapter
        const { PrismaPg } = await import("@prisma/adapter-pg");
        const { Pool } = await import("pg");

        const connectionString = process.env.DATABASE_URL!;
        const pool = new Pool({ connectionString });
        const adapter = new PrismaPg(pool);

        return new PrismaClient({ adapter });
    }
}

/**
 * Get or create the Prisma client singleton
 * For SQLite, this returns a Promise; for PostgreSQL, it's synchronous
 */
let prismaPromise: Promise<PrismaClient> | null = null;

export async function getPrismaClient(): Promise<PrismaClient> {
    if (globalThis.prisma) {
        return globalThis.prisma;
    }

    if (prismaPromise) {
        return prismaPromise;
    }

    prismaPromise = createPrismaClient().then((client) => {
        if (process.env.NODE_ENV !== "production") {
            globalThis.prisma = client;
        }
        return client;
    });

    return prismaPromise;
}

// Export a wrapper that works for both databases
// This is a proxy that delegates to the correct client
export const prisma = new Proxy({} as PrismaClient, {
    get(_target, prop) {
        // For build-time/serverless, we need to handle this differently
        const dbType = getDatabaseType();
        
        if (dbType === "sqlite") {
            throw new Error("SQLite requires using getPrismaClient() - direct access not supported at build time");
        }
        
        // For PostgreSQL in dev mode, fall back to sync client
        if (!globalThis.prisma && process.env.NODE_ENV === "development") {
            void (async () => {
                const { PrismaPg } = await import("@prisma/adapter-pg");
                const { Pool } = await import("pg");
                const pool = new Pool({ connectionString: process.env.DATABASE_URL });
                const adapter = new PrismaPg(pool);
                globalThis.prisma = new PrismaClient({ adapter });
            })();
        }
        
        return (globalThis.prisma as PrismaClient)[prop as keyof PrismaClient];
    },
});

// Re-export types
export * from "@prisma/client";
