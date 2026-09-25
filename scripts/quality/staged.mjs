import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { baselinePath, projectRoot, qualityEngine, printResults } from "./check.mjs";

export function git(root, args) {
  return execFileSync("git", ["--literal-pathspecs", "-C", root, ...args], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
}

export function indexEntries(root) {
  const raw = git(root, ["ls-files", "--stage", "-z"]);
  const entries = new Map();
  for (const record of raw.split("\0").filter(Boolean)) {
    const [header, ...name] = record.split("\t");
    const [mode, oid, stage] = header.split(" ");
    if (stage !== "0") throw new Error("Resolve unmerged index entries before running staged checks.");
    entries.set(name.join("\t"), { mode, oid });
  }
  return { raw, entries };
}

export function stagedBlob(root, entries, file) {
  const entry = entries.get(file);
  if (!entry || !["100644", "100755"].includes(entry.mode)) {
    throw new Error(`Expected a regular staged file: ${file}`);
  }
  return git(root, ["cat-file", "blob", entry.oid]);
}

const normalize = (text) => text.replaceAll("\r\n", "\n");
const isCode = (file) => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file);
const isToolchain = (file) => file === "eslint.config.mjs" || file === "package.json" || file.startsWith("scripts/quality/");

export async function verifyToolchain(root, entries) {
  const localFiles = await readdir(resolve(root, "scripts/quality"));
  const files = new Set([
    "eslint.config.mjs", "package.json",
    ...localFiles.filter((file) => /\.(mjs|json)$/.test(file)).map((file) => `scripts/quality/${file}`),
    ...[...entries.keys()].filter(isToolchain),
  ]);
  for (const file of files) {
    const staged = stagedBlob(root, entries, file);
    const working = await readFile(resolve(root, file), "utf8");
    if (normalize(staged) !== normalize(working)) {
      throw new Error(`Quality toolchain differs from the index: ${file}. Stage or restore its intended changes explicitly; no files were modified.`);
    }
  }
}

export async function checkStaged({ root = projectRoot, createEngine = qualityEngine } = {}) {
  const changed = git(root, ["diff", "--cached", "--no-renames", "--name-only", "--diff-filter=ACMRD", "-z"]).split("\0").filter(Boolean);
  const snapshot = indexEntries(root);
  // Read-only whitespace validation also covers staged deletions and non-code files.
  git(root, ["diff", "--cached", "--check"]);
  if (!changed.length) {
    console.log("No added or modified staged files to check.");
    return true;
  }
  const toolchainChanged = changed.some(isToolchain);
  const candidates = toolchainChanged ? [...snapshot.entries.keys()] : changed.filter((file) => snapshot.entries.has(file));
  const files = candidates.filter(isCode);
  if (!files.length && !toolchainChanged) {
    console.log("Staged whitespace checks passed; no JavaScript or TypeScript changes.");
    return true;
  }
  // Source is linted directly from immutable index blobs, not from working files.
  // Configuration must match the index because ESLint loads executable config.
  await verifyToolchain(root, snapshot.entries);
  const baseline = JSON.parse(stagedBlob(root, snapshot.entries, baselinePath));
  const engine = await createEngine({ root, baseline });
  const results = [];
  for (const file of files) {
    if (await engine.isPathIgnored(resolve(root, file))) continue;
    const text = stagedBlob(root, snapshot.entries, file);
    results.push(...await engine.lintText(text, { filePath: resolve(root, file) }));
  }
  if (indexEntries(root).raw !== snapshot.raw) {
    throw new Error("The index changed during checks. Run them again; no files were modified.");
  }
  return printResults(engine, results);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!await checkStaged()) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (error.stderr) console.error(String(error.stderr));
    process.exitCode = 1;
  }
}
