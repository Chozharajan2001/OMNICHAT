/**
 * Prisma Schema Drift Check
 *
 * Compares model definitions between schema.prisma (PostgreSQL) and
 * schema.sqlite.prisma (SQLite) to detect silent divergence.
 *
 * Checks:
 * - Same model names in both schemas
 * - Same field names per model
 * - Same field types (with provider-specific mapping)
 * - Same relation fields
 * - Same declared indexes/uniques in both schemas
 * - Every SQLite index actually created by prisma/sqlite-init.sql
 *
 * Exit code 0 = no drift, 1 = drift detected.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Type mappings between PostgreSQL and SQLite providers
const TYPE_EQUIVALENCES = {
  "String": ["String"],
  "Int": ["Int"],
  "BigInt": ["BigInt", "Int"],
  "Float": ["Float"],
  "Decimal": ["Decimal", "Float"],
  "Boolean": ["Boolean"],
  "DateTime": ["DateTime"],
  "Json": ["Json", "String"],
  "Bytes": ["Bytes", "String"],
};

function parseModels(schema) {
  const models = {};
  const modelRegex = /model\s+(\w+)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
  let match;

  while ((match = modelRegex.exec(schema)) !== null) {
    const modelName = match[1];
    const body = match[2];
    const fields = {};

    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;

      const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\[\])?\s*(.*)/);
      if (fieldMatch) {
        const [, name, type, isArray, rest] = fieldMatch;
        fields[name] = {
          type,
          isArray: !!isArray,
          isRelation: rest.includes("@relation"),
          isId: rest.includes("@id"),
          isUnique: rest.includes("@unique"),
          hasDefault: rest.includes("@default"),
          isOptional: rest.includes("?") || trimmed.includes("?"),
        };
      }
    }

    models[modelName] = fields;
  }

  return models;
}

function typesEquivalent(pgType, sqliteType) {
  if (pgType === sqliteType) return true;
  const equivalents = TYPE_EQUIVALENCES[pgType];
  if (equivalents && equivalents.includes(sqliteType)) return true;
  // Reverse check
  for (const [, values] of Object.entries(TYPE_EQUIVALENCES)) {
    if (values.includes(pgType) && values.includes(sqliteType)) return true;
  }
  return false;
}

function checkDrift(pgModels, sqliteModels) {
  const issues = [];

  // Check model presence
  const pgNames = Object.keys(pgModels).sort();
  const sqliteNames = Object.keys(sqliteModels).sort();

  for (const name of pgNames) {
    if (!sqliteModels[name]) {
      issues.push(`MISSING MODEL: "${name}" exists in PostgreSQL schema but not in SQLite schema`);
    }
  }
  for (const name of sqliteNames) {
    if (!pgModels[name]) {
      issues.push(`MISSING MODEL: "${name}" exists in SQLite schema but not in PostgreSQL schema`);
    }
  }

  // Check fields in shared models
  for (const modelName of pgNames) {
    if (!sqliteModels[modelName]) continue;

    const pgFields = pgModels[modelName];
    const sqliteFields = sqliteModels[modelName];
    const pgFieldNames = Object.keys(pgFields).sort();
    const sqliteFieldNames = Object.keys(sqliteFields).sort();

    for (const fieldName of pgFieldNames) {
      if (!sqliteFields[fieldName]) {
        issues.push(`MISSING FIELD: ${modelName}.${fieldName} exists in PostgreSQL but not SQLite`);
        continue;
      }

      const pg = pgFields[fieldName];
      const sq = sqliteFields[fieldName];

      if (!typesEquivalent(pg.type, sq.type)) {
        issues.push(`TYPE DRIFT: ${modelName}.${fieldName} is "${pg.type}" in PostgreSQL but "${sq.type}" in SQLite`);
      }
      if (pg.isArray !== sq.isArray) {
        issues.push(`ARRAY DRIFT: ${modelName}.${fieldName} isArray=${pg.isArray} in PostgreSQL but ${sq.isArray} in SQLite`);
      }
      if (pg.isRelation !== sq.isRelation) {
        issues.push(`RELATION DRIFT: ${modelName}.${fieldName} isRelation=${pg.isRelation} in PostgreSQL but ${sq.isRelation} in SQLite`);
      }
    }

    for (const fieldName of sqliteFieldNames) {
      if (!pgFields[fieldName]) {
        issues.push(`MISSING FIELD: ${modelName}.${fieldName} exists in SQLite but not PostgreSQL`);
      }
    }
  }

  return issues;
}

/**
 * Prisma schema names its indexes deterministically: <table>_<columns>_idx for
 * @@index and _key for @@unique, where <table> is the @@map value. Two artifacts
 * are produced from those declarations and both used to drift silently: the
 * second schema, and prisma/sqlite-init.sql (what `pnpm db:init` actually runs).
 */
function parseIndexNames(schema) {
  const names = new Set();
  const modelRegex = /model\s+(\w+)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
  let match;

  while ((match = modelRegex.exec(schema)) !== null) {
    const body = match[2];
    const mapped = body.match(/@@map\("([^"]+)"\)/);
    const table = mapped ? mapped[1] : match[1];

    for (const line of body.split("\n")) {
      const index = line.match(/@@(index|unique)\(\[([^\]]+)\]/);
      if (!index) continue;
      const columns = index[2].split(",").map((part) => part.trim().split(/\s+/)[0]);
      names.add(`${table}_${columns.join("_")}_${index[1] === "index" ? "idx" : "key"}`);
    }
  }

  return names;
}

function checkIndexDrift(pgSchema, sqliteSchema, initSql) {
  const issues = [];
  const pgNames = parseIndexNames(pgSchema);
  const sqliteNames = parseIndexNames(sqliteSchema);

  for (const name of pgNames) {
    if (!sqliteNames.has(name)) issues.push(`MISSING INDEX: "${name}" declared only in the PostgreSQL schema`);
  }
  for (const name of sqliteNames) {
    if (!pgNames.has(name)) issues.push(`MISSING INDEX: "${name}" declared only in the SQLite schema`);
  }

  const created = new Set([...initSql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map((m) => m[1]));
  for (const name of sqliteNames) {
    if (!created.has(name)) issues.push(`INIT SQL DRIFT: "${name}" is declared in the schema but not created by prisma/sqlite-init.sql`);
  }

  return { issues, count: sqliteNames.size };
}

async function main() {
  const pgSchema = await readFile(resolve(root, "prisma/schema.prisma"), "utf8");
  const sqliteSchema = await readFile(resolve(root, "prisma/schema.sqlite.prisma"), "utf8");

  const pgModels = parseModels(pgSchema);
  const sqliteModels = parseModels(sqliteSchema);

  const pgCount = Object.keys(pgModels).length;
  const sqliteCount = Object.keys(sqliteModels).length;

  console.log(`Prisma drift check: ${pgCount} PostgreSQL models, ${sqliteCount} SQLite models`);

  const issues = checkDrift(pgModels, sqliteModels);
  const indexCheck = checkIndexDrift(pgSchema, sqliteSchema, await readFile(resolve(root, "prisma/sqlite-init.sql"), "utf8"));
  issues.push(...indexCheck.issues);

  if (issues.length === 0) {
    console.log(`✓ No drift detected — schemas are consistent (${indexCheck.count} indexes, init SQL covered).`);
    return;
  }

  console.error(`\n✗ ${issues.length} drift issue(s) detected:\n`);
  for (const issue of issues) {
    console.error(`  • ${issue}`);
  }
  console.error("\nFix: align prisma/schema.prisma, prisma/schema.sqlite.prisma and prisma/sqlite-init.sql (regenerate the latter with `pnpm db:init`).");
  process.exitCode = 1;
}

await main();
