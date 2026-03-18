import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env["DATABASE_URL"] ?? "file:./omnichat.db";
const isSqlite =
  databaseUrl.startsWith("file:") ||
  databaseUrl.includes(".db") ||
  databaseUrl.includes(".sqlite");

export default defineConfig({
  schema: isSqlite ? "prisma/schema.sqlite.prisma" : "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
