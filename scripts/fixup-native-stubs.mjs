#!/usr/bin/env node
/**
 * Create empty stand-ins for native packages pnpm skips on this OS.
 *
 * Background: `libsql` (via @prisma/adapter-libsql) ships one native package
 * per OS/CPU/libc, and pnpm installs only the current platform's. Next's
 * standalone tracer still walks the absent ones and its copy step dies with
 * ENOENT instead of skipping them -- so `pnpm build` fails on every OS, each
 * missing a different set. An empty directory satisfies the copier (it
 * replicates the tree; the runtime loads exactly one binding for the running
 * platform and never touches the others), with zero bytes shipped.
 *
 * Runs automatically as `prebuild` before every `pnpm build`, on every OS.
 * If @libsql ever publishes a new platform, add its directory name below --
 * the build error names the missing path verbatim.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Every native variant @libsql/client 0.x can ask for, read from the
// installed shell package itself so a new platform never needs a code change
// here (the build error names the missing path verbatim as a backup signal).
function nativeVariants() {
    try {
        const shell = join(PROJECT_DIR, "node_modules", "libsql", "package.json");
        const optional = JSON.parse(readFileSync(shell, "utf8")).optionalDependencies ?? {};
        const names = Object.keys(optional)
            .map((name) => name.split("/")[1])
            .filter(Boolean);
        if (names.length > 0) return names;
    } catch {
        // Fall through to the last-known list.
    }
    return [
        "darwin-arm64",
        "darwin-x64",
        "linux-x64-gnu",
        "linux-x64-musl",
        "linux-arm64-gnu",
        "linux-arm64-musl",
        "linux-arm-gnueabihf",
        "linux-arm-musleabihf",
        "win32-x64-msvc",
    ];
}

const VARIANTS = nativeVariants();

function storeDirs() {
    const pnpmDir = join(PROJECT_DIR, "node_modules", ".pnpm");
    if (!existsSync(pnpmDir)) return [];
    return readdirSync(pnpmDir)
        .filter((entry) => entry.startsWith("@libsql+"))
        .map((entry) => join(pnpmDir, entry, "node_modules", "@libsql"));
}

function siblingStoreDirs() {
    // pnpm never materializes skipped platforms at all -- not even the store
    // entry -- so there is nothing to discover by listing. Sibling entries
    // follow one shape (@libsql+<platform>@<version>), so every platform the
    // tracer can name is synthesized from the ones installed. Only scopes that
    // can actually reference natives get siblings.
    const pnpmDir = join(PROJECT_DIR, "node_modules", ".pnpm");
    if (!existsSync(pnpmDir)) return [];
    const out = [];
    for (const entry of readdirSync(pnpmDir)) {
        const scoped = /^(@libsql\+)[^@]+(@.*)$/.exec(entry);
        if (scoped) {
            const [, prefix, suffix] = scoped;
            const involved =
                entry.startsWith("@libsql+libsql@") ||
                VARIANTS.some((variant) => entry.includes(variant));
            if (!involved) continue;
            for (const variant of VARIANTS) {
                out.push(join(pnpmDir, `${prefix}${variant}${suffix}`, "node_modules", "@libsql"));
            }
            continue;
        }
        if (entry.startsWith("libsql@")) {
            out.push(join(pnpmDir, entry, "node_modules", "@libsql"));
        }
    }
    return out;
}

const roots = [
    join(PROJECT_DIR, "node_modules", "@libsql"),
    ...storeDirs(),
    ...siblingStoreDirs(),
];
let created = 0;
for (const root of roots) {
    for (const variant of VARIANTS) {
        const dir = join(root, variant);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
            created++;
        }
    }
}

if (created > 0) {
    console.log(`native-stubs: created ${created} empty @libsql platform directorie(s) for the tracer`);
}
