import fs from "node:fs";
import { createClient } from "@libsql/client";
import { execFileSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL ?? "file:./omnichat.db";

if (!(databaseUrl.startsWith("file:") || databaseUrl.includes(".db") || databaseUrl.includes(".sqlite"))) {
  console.error("db:init: DATABASE_URL is not SQLite. Use Prisma migrate/db push for PostgreSQL.");
  process.exit(1);
}

const client = createClient({ url: databaseUrl });
const existingTables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");

if (existingTables.rows.length > 0) {
  console.log(`db:init skipped for ${databaseUrl}; schema already exists.`);
  console.log(existingTables.rows.map((row) => row.name).join("\n"));
  await client.close();
  process.exit(0);
}

const sqlPath = "prisma/sqlite-init.sql";
execFileSync("npx", ["prisma", "generate"], { stdio: "inherit", shell: true });
execFileSync("npx", ["prisma", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.sqlite.prisma", "--script", "--output", sqlPath], { stdio: "inherit", shell: true });

const sql = fs.readFileSync(sqlPath, "utf8");
await client.executeMultiple(sql);
const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
console.log(`db:init complete for ${databaseUrl}`);
console.log(tables.rows.map((row) => row.name).join("\n"));
await client.close();
