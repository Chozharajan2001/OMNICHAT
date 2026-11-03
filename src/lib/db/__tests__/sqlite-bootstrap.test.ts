// Contract tests for first-boot SQLite provisioning.
//
// The desktop installer ships a bare data directory, so the server must
// create its own tables from prisma/sqlite-init.sql. These tests pin the two
// halves that can silently rot: the statement splitter (a bad split corrupts
// every fresh install) and the drift between the Prisma schema and the
// checked-in DDL (a new model without a CREATE TABLE breaks new installs
// while every existing database keeps working).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { splitStatements } from "../sqlite-bootstrap";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

function readRepo(relative: string): string {
    return readFileSync(join(REPO_ROOT, relative), "utf8");
}

describe("splitStatements", () => {
    it("splits on semicolon-newline and drops comments and blanks", () => {
        const statements = splitStatements(
            '-- CreateTable\nCREATE TABLE "a" (\n    "id" TEXT\n);\n\n-- CreateIndex\nCREATE UNIQUE INDEX "a_id" ON "a"("id");\n'
        );
        expect(statements).toEqual([
            'CREATE TABLE "a" (\n    "id" TEXT\n)',
            'CREATE UNIQUE INDEX "a_id" ON "a"("id")',
        ]);
    });

    it("keeps semicolons that are not statement terminators", () => {
        const statements = splitStatements("INSERT INTO t (v) VALUES ('a;b');\nSELECT 1;\n");
        expect(statements).toHaveLength(2);
        expect(statements[0]).toContain("'a;b'");
    });

    it("splits the real init file into one statement per object", () => {
        const statements = splitStatements(readRepo("prisma/sqlite-init.sql"));
        const tables = statements.filter((statement) => statement.startsWith("CREATE TABLE"));
        const indexes = statements.filter((statement) => statement.startsWith("CREATE UNIQUE INDEX") || statement.startsWith("CREATE INDEX"));
        expect(tables).toHaveLength(9);
        expect(indexes.length).toBeGreaterThan(0);
        expect(statements.every((statement) => !statement.includes("-- Create"))).toBe(true);
    });
});

describe("sqlite-init.sql drift", () => {
    it("covers every model mapped in schema.sqlite.prisma", () => {
        const schema = readRepo("prisma/schema.sqlite.prisma");
        const initSql = readRepo("prisma/sqlite-init.sql");
        const models = [...schema.matchAll(/^model (\w+) \{/gm)].map((match) => match[1]);
        expect(models.length).toBeGreaterThan(0);
        for (const model of models) {
            const map = new RegExp(`@@map\\("(\\w+)"\\)`);
            const block = schema.slice(schema.indexOf(`model ${model} {`));
            const table = block.slice(0, block.indexOf("\n}")).match(map)?.[1];
            expect(table, `${model} must declare @@map so the table name is pinned`).toBeDefined();
            expect(initSql).toContain(`CREATE TABLE "${table}"`);
        }
    });

    it("creates no tables the schema does not declare", () => {
        const schema = readRepo("prisma/schema.sqlite.prisma");
        const initSql = readRepo("prisma/sqlite-init.sql");
        const mapped = new Set(
            [...schema.matchAll(/@@map\("(\w+)"\)/g)].map((match) => match[1])
        );
        // Lines end `CREATE TABLE "users" (` — no end anchor; \r would break one.
        const created = [...initSql.matchAll(/^CREATE TABLE "(\w+)"/gm)].map((match) => match[1]);
        expect(created.length).toBeGreaterThan(0);
        for (const table of created) {
            expect(mapped.has(table), `init.sql creates undeclared table ${table}`).toBe(true);
        }
    });
});

describe("ensureSqliteSchema", () => {
    it("skips non-file databases without touching the adapter", async () => {
        vi.resetModules();
        const prismaMock = { $queryRawUnsafe: vi.fn(), $executeRawUnsafe: vi.fn() };
        vi.doMock("../prisma", () => ({ prisma: prismaMock }));
        const { ensureSqliteSchema } = await import("../sqlite-bootstrap");
        await ensureSqliteSchema("postgresql://host/db");
        expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
        expect(prismaMock.$executeRawUnsafe).not.toHaveBeenCalled();
        vi.doUnmock("../prisma");
    });
});
