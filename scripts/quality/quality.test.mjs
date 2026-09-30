import assert from "node:assert/strict";
import { test } from "node:test";
import { Linter } from "eslint";
import { createComplexityRule } from "./complexity-rule.mjs";
import { validateBaseline, projectRoot } from "./check.mjs";
import { checkStaged, git } from "./staged.mjs";
import { installHook } from "./install-hooks.mjs";
import { mkdir, mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Never let an inherited Git hook/alternate-index environment target the user's
// repository while creating or staging files in disposable fixture repositories.
for (const key of Object.keys(process.env).filter((key) => key.startsWith("GIT_"))) {
  delete process.env[key];
}

function measure(source, baseline = {}) {
  const measurements = [];
  const rule = createComplexityRule({ baseline, onMeasure: (entry) => measurements.push(entry) });
  const messages = new Linter().verify(source, {
    plugins: { quality: { rules: { complexity: rule } } },
    rules: { "quality/complexity": "error" },
  }, { filename: "sample.js" });
  return { measurements, messages };
}

test("measures functions independently and counts optional/default/logical paths", () => {
  const { measurements, messages } = measure("function outer(a = 1) { function inner(b) { return b?.x || a; } return inner(a); }");
  assert.equal(messages.length, 0);
  assert.equal(measurements.find((item) => item.key.endsWith("::outer")).complexity, 2);
  assert.equal(measurements.find((item) => item.key.endsWith("::outer/inner")).complexity, 3);
});

test("function identities survive blank lines and unrelated named function insertion", () => {
  const before = measure("function one(a) { return a ? 1 : 0; }");
  const after = measure("\n\nfunction unrelated() {}\nfunction one(a) { return a ? 1 : 0; }");
  assert.equal(before.measurements[0].key, after.measurements.find((item) => item.key.endsWith("::one")).key);
});

test("rejects a one-point regression against a measured per-function baseline", () => {
  const original = measure("function one(a) { return a ? 1 : 0; }").measurements[0];
  const { messages } = measure("function one(a) { return a ? 1 : (a || 0); }", { [original.key]: original.complexity });
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /complexity 3; allowed 2/);
});

test("new functions have a real limit of ten, while measured legacy limits do not leak", () => {
  const source = "function legacy(a) { return " + Array(12).fill("a").join(" || ") + "; }";
  const original = measure(source).measurements[0];
  assert.equal(measure(source).messages.length, 1);
  assert.equal(measure(source, { [original.key]: 12 }).messages.length, 0);
  assert.equal(measure(source.replace("legacy", "newFunction"), { [original.key]: 12 }).messages.length, 1);
});

test("class names and same-scope callback ordinals distinguish functions", () => {
  const { measurements } = measure("class A { method() {} } class B { method() {} } [1].map(() => 1); [2].map(() => 2);");
  const keys = measurements.map((item) => item.key);
  assert.equal(new Set(keys).size, 4);
  assert.ok(keys.some((key) => key.endsWith("::A.method")));
  assert.ok(keys.some((key) => key.endsWith("::B.method")));
});

test("malformed or nonnumeric baselines fail closed", () => {
  assert.throws(() => validateBaseline([]));
  assert.throws(() => validateBaseline({ file: { function: "999" } }));
  assert.throws(() => validateBaseline({ file: { function: 0 } }));
  assert.deepEqual(validateBaseline({ file: { function: 2 } }), { "file::function": 2 });
});

async function fixture(t) {
  await mkdir(join(projectRoot, ".next"), { recursive: true });
  const root = await mkdtemp(join(projectRoot, ".next/quality test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, ["init", "--quiet"]);
  const put = async (file, text, stage = true) => {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), text);
    if (stage) git(root, ["add", "--", file]);
  };
  await put("package.json", "{}\n");
  await put("eslint.config.mjs", 'export default [{ rules: { "no-debugger": "error", "no-unused-vars": "warn" } }];\n');
  await put("scripts/quality/complexity-baseline.json", "{}\n");
  return { root, put };
}

async function unchangedIndex(root, operation) {
  const before = await readFile(join(root, ".git/index"));
  const result = await operation();
  assert.deepEqual(await readFile(join(root, ".git/index")), before);
  return result;
}

test("staged invalid content fails despite an unstaged fix, preserving index and worktree", async (t) => {
  const { root, put } = await fixture(t);
  await put("src/[space name].js", "export function example() { debugger; }\n");
  await put("src/[space name].js", "export function example() { return 1; }\n", false);
  assert.equal(await unchangedIndex(root, () => checkStaged({ root })), false);
  assert.match(await readFile(join(root, "src/[space name].js"), "utf8"), /return 1/);
});

test("valid staged content passes despite unstaged lint errors", async (t) => {
  const { root, put } = await fixture(t);
  await put("src/example.js", "export function example() { return 1; }\n");
  await put("src/example.js", "debugger;\n", false);
  assert.equal(await unchangedIndex(root, () => checkStaged({ root })), true);
  assert.equal(await readFile(join(root, "src/example.js"), "utf8"), "debugger;\n");
});

test("staged warnings and complexity regressions both block the hook", async (t) => {
  const { root, put } = await fixture(t);
  await put("src/example.js", "const unused = 1;\n");
  assert.equal(await unchangedIndex(root, () => checkStaged({ root })), false);
  await put("src/example.js", "export function example(a) { return a ? 1 : 0; }\n");
  await put("scripts/quality/complexity-baseline.json", JSON.stringify({ "src/example.js": { example: 1 } }) + "\n");
  assert.equal(await unchangedIndex(root, () => checkStaged({ root })), false);
});

test("partially staged executable configuration is rejected without changing the index", async (t) => {
  const { root, put } = await fixture(t);
  await put("src/example.js", "export const example = 1;\n");
  await put("eslint.config.mjs", "export default [];\n", false);
  await unchangedIndex(root, () => assert.rejects(checkStaged({ root }), /toolchain differs from the index/));
});

test("a removed baseline cannot silently fall back to its working-tree copy", async (t) => {
  const { root, put } = await fixture(t);
  await put("src/example.js", "export const example = 1;\n");
  git(root, ["update-index", "--force-remove", "--", "scripts/quality/complexity-baseline.json"]);
  await unchangedIndex(root, () => assert.rejects(checkStaged({ root }), /Expected a regular staged file/));
});

test("empty index succeeds without attempting to load configuration", async (t) => {
  const { root } = await fixture(t);
  // This is an isolated fixture index, never the user's repository.
  git(root, ["read-tree", "--empty"]);
  assert.equal(await unchangedIndex(root, () => checkStaged({ root })), true);
});

test("installer preserves Git config, normalizes line endings, and never overwrites hooks", async (t) => {
  const { root, put } = await fixture(t);
  await put(".githooks/pre-commit", "#!/bin/sh\r\nexit 0\r\n");
  const before = await readFile(join(root, ".git/config"));
  const target = await installHook(root);
  assert.equal(await readFile(target, "utf8"), "#!/bin/sh\nexit 0\n");
  if (process.platform !== "win32") assert.ok((await stat(target)).mode & 0o111);
  await assert.rejects(installHook(root), /already exists/);
  assert.deepEqual(await readFile(join(root, ".git/config")), before);
  assert.equal(await readFile(target, "utf8"), "#!/bin/sh\nexit 0\n");
});

test("installer reports the tracked hook when core.hooksPath already activates it", async (t) => {
  const { root, put } = await fixture(t);
  await put(".githooks/pre-commit", "#!/bin/sh\nexit 0\n");
  // This mirrors the real repository: package.json "prepare" always sets it.
  git(root, ["config", "core.hooksPath", ".githooks"]);
  const tracked = resolve(root, ".githooks/pre-commit");
  const before = await readFile(join(root, ".git/config"));
  assert.equal(await installHook(root), tracked);
  // No dead copy is written where Git will never run it.
  await assert.rejects(stat(join(root, ".git/hooks/pre-commit")), { code: "ENOENT" });
  assert.deepEqual(await readFile(join(root, ".git/config")), before);
});

test("tracked hook invokes the quality runner and propagates a failure without committing", async (t) => {
  const { root, put } = await fixture(t);
  await put(".githooks/pre-commit", await readFile(join(projectRoot, ".githooks/pre-commit"), "utf8"));
  await put("scripts/quality/staged.mjs", 'console.error("staged runner executed"); process.exit(7);\n');
  await installHook(root);
  await unchangedIndex(root, () => {
    assert.throws(() => git(root, ["hook", "run", "pre-commit"]), (error) => {
      assert.equal(error.status, 7);
      assert.match(String(error.stderr), /staged runner executed/);
      return true;
    });
  });
});
