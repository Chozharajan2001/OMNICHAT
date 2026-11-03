// scripts/quality/link-hooks.mjs
// Invoked by the `prepare` script: points Git at the tracked hooks directory.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Container and CI image builds have neither a git binary nor a .git directory,
// and a local convenience must not break `pnpm install` there (it did: the whole
// Docker build failed on "sh: git: not found"). Absence is skipped silently; a
// real git error still surfaces.
export function linkHooks(root = process.cwd()) {
    if (!existsSync(resolve(root, ".git"))) return null;
    try {
        execFileSync("git", ["-C", root, "config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
        return ".githooks";
    } catch (error) {
        // A repository directory without a git binary is a packaging artifact,
        // not a developer machine; anything else is a real git failure.
        if (error.code === "ENOENT") return null;
        throw error;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    linkHooks();
}
