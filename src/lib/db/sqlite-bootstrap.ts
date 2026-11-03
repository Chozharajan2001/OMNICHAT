// First-boot schema provisioning for file-backed (SQLite) databases.
//
// Hosted deployments migrate through the compose `migrate` service, but the
// desktop installer ships a bare data directory: no tables exist until
// something creates them, and every sign-in died with
// `SQLITE_ERROR: no such table: main.users` (observed in the installed app).
// This module applies `prisma/sqlite-init.sql` — the checked-in SQLite DDL
// generated from `prisma/schema.sqlite.prisma` — exactly once, when the
// `users` table is absent. Existing databases are untouched (single probe
// query, no-op when tables exist), and non-file DATABASE_URLs are ignored.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "./prisma";

export function initSqlCandidates(cwd: string): string[] {
    return [
        // Bundled desktop app: server.js chdir's into the resource dir, so
        // the staged copy sits beside it.
        join(cwd, "sqlite-init.sql"),
        // Development / source checkout.
        join(cwd, "prisma", "sqlite-init.sql"),
    ];
}

export function splitStatements(sql: string): string[] {
    // The init file separates objects with `-- CreateTable`-style full-line
    // comments. Strip those first: splitting before stripping would glue each
    // comment to the following statement and the comment filter would drop
    // real DDL with it (observed: every statement lost).
    const uncommented = sql
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n");
    return uncommented
        .split(/;\s*\n/)
        .map((statement) => statement.trim().replace(/;$/, ""))
        .filter((statement) => statement.length > 0);
}

export async function applyStatements(
    execute: (statement: string) => Promise<unknown>,
    statements: string[]
): Promise<void> {
    for (const statement of statements) {
        try {
            await execute(statement);
        } catch (error) {
            // Concurrent first boots (or a half-applied previous attempt) meet
            // their own tables: only "already exists" is tolerated.
            if (error instanceof Error && /already exists/i.test(error.message)) continue;
            throw error;
        }
    }
}

export async function ensureSqliteSchema(databaseUrl = process.env.DATABASE_URL ?? ""): Promise<void> {
    if (!databaseUrl.startsWith("file:")) return;

    const probe = await prisma
        .$queryRawUnsafe<Array<{ name: string }>>(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'"
        )
        .catch(() => null);
    if (probe && probe.length > 0) return;

    const initSql = initSqlCandidates(process.cwd()).find((candidate) => existsSync(candidate));
    if (!initSql) {
        throw new Error(
            "SQLite database has no tables and no sqlite-init.sql was found beside the server or under prisma/. " +
                "The desktop bundle must stage it; refusing to boot half-initialized."
        );
    }

    await applyStatements(
        (statement) => prisma.$executeRawUnsafe(statement),
        splitStatements(readFileSync(initSql, "utf8"))
    );
}
