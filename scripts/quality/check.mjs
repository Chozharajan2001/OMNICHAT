import { ESLint } from "eslint";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createComplexityRule } from "./complexity-rule.mjs";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const baselinePath = "scripts/quality/complexity-baseline.json";

export function validateBaseline(baseline) {
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
    throw new Error("Complexity baseline must contain per-file function measurements.");
  }
  const flattened = {};
  for (const [file, functions] of Object.entries(baseline)) {
    if (!functions || typeof functions !== "object" || Array.isArray(functions)) {
      throw new Error(`Invalid complexity baseline file: ${file}`);
    }
    for (const [name, count] of Object.entries(functions)) {
      if (!name || !Number.isInteger(count) || count < 1) {
        throw new Error(`Invalid complexity baseline entry: ${file}::${name}`);
      }
      flattened[`${file}::${name}`] = count;
    }
  }
  return flattened;
}

export async function qualityEngine({ root = projectRoot, baseline, onMeasure } = {}) {
  baseline ??= JSON.parse(await readFile(resolve(root, baselinePath), "utf8"));
  baseline = validateBaseline(baseline);
  return new ESLint({
    cwd: root,
    overrideConfigFile: resolve(root, "eslint.config.mjs"),
    overrideConfig: [{
      files: ["src/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
      ignores: ["**/*.test.*", "**/*.d.{ts,mts,cts}", "src/generated/**"],
      plugins: { quality: { rules: { complexity: createComplexityRule({ root, baseline, onMeasure }) } } },
      rules: { "quality/complexity": "error" },
    }],
  });
}

export async function printResults(engine, results) {
  const formatter = await engine.loadFormatter("stylish");
  const output = formatter.format(results);
  if (output) console.log(output);
  const errors = results.reduce((count, result) => count + result.errorCount, 0);
  const warnings = results.reduce((count, result) => count + result.warningCount, 0);
  console.log(`Quality: ${results.length} files, ${errors} errors, ${warnings} warnings.`);
  return errors === 0 && warnings === 0;
}

export async function main(args = process.argv.slice(2)) {
  const measurements = [];
  const engine = await qualityEngine({ onMeasure: (entry) => measurements.push(entry) });
  const results = await engine.lintFiles(["."]);
  measurements.sort((a, b) => a.key.localeCompare(b.key, "en"));
  if (args.includes("--baseline")) {
    if (results.some((result) => result.fatalErrorCount > 0)) {
      await printResults(engine, results);
      throw new Error("Cannot measure a baseline while source files have parsing errors.");
    }
    // Print only: baseline changes must be explicit and reviewed, never automatic.
    const grouped = {};
    for (const { key, complexity } of measurements) {
      const [file, name] = key.split("::");
      if (args[1] && !file.startsWith(args[1])) continue;
      (grouped[file] ??= {})[name] = complexity;
    }
    console.log("{\n" + Object.entries(grouped).map(([file, functions]) =>
      `  ${JSON.stringify(file)}: ${JSON.stringify(functions)}`
    ).join(",\n") + "\n}");
    return;
  }
  const valid = await printResults(engine, results);
  const maximum = Math.max(0, ...measurements.map((entry) => entry.complexity));
  console.log(`Complexity: ${measurements.length} functions measured; maximum ${maximum}; new functions limited to 10.`);
  for (const entry of measurements.filter((item) => item.complexity > 10)) {
    console.log(`  ${entry.complexity}/${entry.allowed} ${entry.key}`);
  }
  if (!valid) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
