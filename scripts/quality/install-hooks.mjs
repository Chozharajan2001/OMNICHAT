import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot } from "./check.mjs";
import { git } from "./staged.mjs";

export async function installHook(root = projectRoot) {
  const tracked = resolve(root, ".githooks/pre-commit");
  const source = (await readFile(tracked, "utf8")).replaceAll("\r\n", "\n");
  const gitDir = resolve(root, git(root, ["rev-parse", "--git-common-dir"]).trim());
  const target = resolve(root, git(root, ["rev-parse", "--git-path", "hooks/pre-commit"]).trim());
  // "prepare" points core.hooksPath at .githooks, so the tracked hook IS the
  // active one; copying it into .git/hooks would install a hook git never runs.
  if (target === tracked) {
    console.log(`Tracked hook is already active via core.hooksPath: ${target}`);
    return target;
  }
  // Do not silently install into a shared/custom hooksPath.
  if (target !== resolve(gitDir, "hooks/pre-commit")) {
    throw new Error("A custom hooks directory is active. Integrate the tracked hook manually; no configuration was changed.");
  }
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(target, source, { flag: "wx", mode: 0o755 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`A pre-commit hook already exists at ${target}. It was not overwritten; integrate the tracked hook manually.`);
  }
  console.log(`Installed pre-commit hook at ${target}. Git configuration was not changed.`);
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await installHook();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
