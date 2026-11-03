#!/usr/bin/env node
/**
 * OmniChat Desktop Build Script
 * Cross-platform build script for Tauri desktop application
 */

import { execSync } from "node:child_process";
import {
    copyFileSync,
    cpSync,
    createWriteStream,
    existsSync,
    lstatSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    realpathSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { resolve, join, relative, dirname, basename, sep } from "node:path";
import { platform, arch, tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";

const PROJECT_DIR = resolve(import.meta.dirname, "..");

console.log("=========================================");
console.log("OmniChat Desktop Build Script");
console.log("=========================================");
console.log("");

// Check for required tools
console.log("Checking prerequisites...");

function checkCommand(command, name) {
  try {
    const version = execSync(`${command} --version`, { encoding: "utf-8" }).trim();
    console.log(`✓ ${name}: ${version}`);
    return true;
  } catch {
    console.error(`✗ ${name} is required but not found`);
    return false;
  }
}

const hasNode = checkCommand("node", "Node.js");
const hasPnpm = checkCommand("pnpm", "pnpm");
const hasRust = checkCommand("rustc", "Rust");

if (!hasNode || !hasPnpm || !hasRust) {
  console.error("\nPlease install missing prerequisites and try again.");
  process.exit(1);
}

console.log("");

// Change to project directory
process.chdir(PROJECT_DIR);

// Flags: --stage-only refreshes src-tauri/staging from the current .next
// without rebuilding or bundling (useful after a failed run left a complete
// build behind). Any other positional argument is a Rust target triple.
const scriptArgs = process.argv.slice(2);
const stageOnly = scriptArgs.includes("--stage-only");
const target = scriptArgs.find((arg) => !arg.startsWith("--"));

if (!stageOnly) {
// Install dependencies if needed
if (!existsSync("node_modules")) {
  console.log("Installing dependencies...");
  execSync("pnpm install", { stdio: "inherit" });
}

// Generate Prisma client
console.log("\nGenerating Prisma client...");
execSync("pnpm prisma generate", { stdio: "inherit" });

// Build Next.js application
console.log("\nBuilding Next.js application...");
execSync("pnpm build", { stdio: "inherit" });

// Check if standalone output exists
const standalonePath = join(PROJECT_DIR, ".next", "standalone");
if (!existsSync(standalonePath)) {
  console.error("\n✗ Next.js standalone output not found!");
  console.error("Make sure next.config.ts has 'output: \"standalone\"'");
  process.exit(1);
}

console.log("\n✓ Next.js build complete");
}

// Resolve the newest LTS line from the official release index (no hardcoded
// version to rot) and stage its runtime binary for the installer.
async function stageNodeRuntime(projectDir, stagingDir) {
    const stageDir = join(stagingDir, "node");
    const binaryName = platform() === "win32" ? "node.exe" : "node";
    mkdirSync(stageDir, { recursive: true });
    if (existsSync(join(stageDir, binaryName))) {
        console.log("Node.js runtime already staged, skipping download.");
        return;
    }

    const plat = platform() === "win32" ? "win" : platform() === "darwin" ? "darwin" : "linux";
    const cpu = arch() === "arm64" ? "arm64" : "x64";

    // The runtime is cached outside stagingDir on purpose: assembleStagingTree
    // wipes that directory on every run, and a cache inside it would re-download
    // ~30MB for each build. Keyed by platform+arch, with the resolved version
    // pinned in a VERSION file so a stale cache for another platform is ignored.
    const cacheKey = `${plat}-${cpu}`;
    const cachedBinary = join(projectDir, "src-tauri", ".node-runtime", cacheKey, binaryName);
    const cachedVersionFile = join(projectDir, "src-tauri", ".node-runtime", cacheKey, "VERSION");
    if (existsSync(cachedBinary) && existsSync(cachedVersionFile)) {
        console.log(
            `Reusing cached Node.js ${readFileSync(cachedVersionFile, "utf8").trim()} ${cacheKey} runtime.`
        );
        copyFileSync(cachedBinary, join(stageDir, binaryName));
        return;
    }

    const index = await (await fetch("https://nodejs.org/download/release/index.json")).json();
    const versions = index
        .filter((release) => release.lts && /^v(22|24)\./.test(release.version))
        .map((release) => release.version)
        .sort();
    const lts = versions.at(-1);
    if (!lts) {
        throw new Error("No Node.js v22/v24 LTS release found in the release index");
    }

    const ext = platform() === "win32" ? "zip" : "tar.gz";
    const file = `node-${lts}-${plat}-${cpu}.${ext}`;
    const url = `https://nodejs.org/download/release/${lts}/${file}`;
    console.log(`Downloading ${file} ...`);

    const downloadPath = join(tmpdir(), file);
    const response = await fetch(url);
    if (!response.ok || !response.body) {
        throw new Error(`Node.js download failed: ${response.status} ${url}`);
    }
    await pipeline(response.body, createWriteStream(downloadPath));

    try {
        execSync(`tar -xf "${downloadPath}" -C "${tmpdir()}"`, { stdio: "pipe" });
    } catch {
        throw new Error(
            "Could not extract the Node.js archive (needs tar with zip support, or unzip on Linux)"
        );
    }
    const extractedRoot = join(tmpdir(), file.replace(`.${ext}`, ""));
    const innerBinary = platform() === "win32"
        ? join(extractedRoot, "node.exe")
        : join(extractedRoot, "bin", "node");
    // Copy, not rename: the temp dir and the project may sit on different drives.
    const cacheDir = join(projectDir, "src-tauri", ".node-runtime", cacheKey);
    mkdirSync(cacheDir, { recursive: true });
    copyFileSync(innerBinary, join(cacheDir, binaryName));
    writeFileSync(join(cacheDir, "VERSION"), lts);
    copyFileSync(innerBinary, join(stageDir, binaryName));
    rmSync(extractedRoot, { recursive: true, force: true });
    try {
        rmSync(downloadPath, { force: true });
    } catch {
        // Best-effort temp cleanup only.
    }
    console.log(`Staged ${lts} ${cacheKey} runtime.`);
}

// The Tauri resource walker follows symlinks without cycle protection, and
// Next's standalone node_modules is a pnpm symlink forest, so globbing it
// overflows the build script's stack. Instead, the standalone tree's own
// node_modules — the pruned runtime set Next's tracer chose, top-level links
// plus the .pnpm store subset — is materialized link-free under
// src-tauri/staging/node_modules (gitignored), and only that clean tree is
// bundled. Copying the project's full node_modules instead would ship dev
// dependencies and break pnpm's version isolation; copying individual trace
// files instead would miss the top-level package.json files Node resolves
// through (observed: `Cannot find module 'next'` in the installed app) and
// the sibling store entries nested requires resolve through (observed:
// `Cannot find module 'styled-jsx/package.json'`). The whole pruned tree is
// the only unit that is complete by construction.
// Copy a directory tree's real content, skipping symlinks entirely. Symlinks
// are handled separately by materializeLink: content first, links resolved
// against complete content. Skipping (rather than resolving) keeps this pass
// a plain tree walk: real directories cannot cycle, so no guard is needed.
function copyTreeContent(srcDir, destDir) {
    mkdirSync(destDir, { recursive: true });
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
        const src = join(srcDir, entry.name);
        const dest = join(destDir, entry.name);
        try {
            const st = lstatSync(src);
            if (st.isDirectory() && !st.isSymbolicLink()) {
                copyTreeContent(src, dest);
            } else if (st.isFile() && !st.isSymbolicLink()) {
                copyFileSync(src, dest);
            }
        } catch {
            // Unreadable entries are skipped, never fatal.
        }
    }
}

// List every directory symlink under a root, with canonical targets.
function collectDirLinks(root) {
    const found = [];
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isSymbolicLink()) {
                try {
                    const real = realpathSync(full);
                    if (statSync(real).isDirectory()) found.push({ link: full, real });
                } catch {
                    // Dangling links are ignored, never staged.
                }
            } else if (entry.isDirectory()) {
                walk(full);
            }
        }
    };
    walk(root);
    return found;
}

// The Tauri resource walker follows directory links without cycle protection,
// and the NSIS/WiX bundlers silently DROP them (observed: an installed app
// with node_modules/next and all 80 store links missing). So staging contains
// zero links: every directory link is materialized as real content. A source
// cycle would loop this forever, so the DAG shape is asserted first.
function assertSourceAcyclic(root) {
    const cycles = [];
    const visit = (dir, chain) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (!entry.isSymbolicLink()) {
                if (entry.isDirectory()) visit(full, chain);
                continue;
            }
            let real;
            try {
                real = realpathSync(full);
                if (!statSync(real).isDirectory()) continue;
            } catch {
                continue;
            }
            if (chain.includes(real)) {
                cycles.push(`${full} -> ${real}`);
                continue;
            }
            visit(real, [...chain, real]);
        }
    };
    visit(root, [realpathSync(root)]);
    if (cycles.length > 0) {
        throw new Error(`Refusing to stage: link cycle(s) would loop materialization:\n${cycles.join("\n")}`);
    }
}

// Staging must also contain zero links (same bundler constraint), asserted as
// a regression tripwire after assembly.
function assertNoLinks(root) {
    const links = [];
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isSymbolicLink()) links.push(full);
            else if (entry.isDirectory()) walk(full);
        }
    };
    walk(root);
    if (links.length > 0) {
        throw new Error(`Refusing to bundle: ${links.length} link(s) staged, bundlers drop them:\n${links.slice(0, 5).join("\n")}`);
    }
}

async function stageBundleModules(projectDir, stagingDir) {
    // assembleStagingTree starts fresh each run; node_modules is this step's
    // own directory, so removing it here cannot wipe the server or statics.
    const srcRoot = join(projectDir, ".next", "standalone", "node_modules");
    const destRoot = join(stagingDir, "node_modules");
    rmSync(destRoot, { recursive: true, force: true });
    mkdirSync(destRoot, { recursive: true });
    assertSourceAcyclic(srcRoot);

    // Root placement. Top-level names come from the source top level (direct
    // dependencies); anything else a staged package may require comes from
    // pnpm's own hoist list (.pnpm/node_modules). A name in both keeps the
    // top-level version; the shadowed one is reported, never silently kept.
    // Staged .pnpm stores serve no resolution purpose (nothing links into
    // them anymore) and are left out: dead weight the installer need not ship.
    // Never staged: `@types/*` (type-only — Node never implicitly loads
    // @types, so nothing resolves them at runtime) and `typescript` (the
    // server ships compiled; nothing requires the compiler). Beyond weight,
    // these are the depth drivers that break installers: observed a 7-level
    // @types/ws → @types/node → undici-types chain whose paths abort
    // makensis, and WiX light fails on the same depths.
    const isExcluded = (name) => name === "typescript" || name.startsWith("@types/");
    const storeOf = new Map(); // root name -> source store dir holding its siblings
    // The store root is the enclosing node_modules of the link target: one
    // level up for `next`, two for `@scope/name`. dirname() alone stops at
    // the scope dir, whose children are platform binding dirs and bare links
    // that must NOT be mistaken for the sibling set (observed: bare `core`
    // and `hrana-client` nested without scope, and missing win32 bindings).
    const storeRootOf = (real) => {
        let dir = dirname(real);
        while (basename(dir) !== "node_modules") {
            const parent = dirname(dir);
            if (parent === dir) {
                throw new Error(`No enclosing node_modules for link target: ${real}`);
            }
            dir = parent;
        }
        return dir;
    };
    const claimRoot = (name, link) => {
        if (isExcluded(name)) return;
        if (storeOf.has(name)) {
            console.log(`  root keeps ${name}; shadowed: ${link}`);
            return;
        }
        const dest = join(destRoot, name);
        rmSync(dest, { recursive: true, force: true });
        const real = realpathSync(link);
        copyTreeContent(real, dest);
        storeOf.set(name, storeRootOf(real));
    };
    const claimScopeChildren = (scopeDir, scope) => {
        for (const child of readdirSync(scopeDir, { withFileTypes: true })) {
            const full = join(scopeDir, child.name);
            if (child.isSymbolicLink() || (child.isDirectory() && !child.isSymbolicLink())) {
                claimRoot(`${scope}/${child.name}`, full);
            }
        }
    };
    for (const entry of readdirSync(srcRoot, { withFileTypes: true })) {
        const full = join(srcRoot, entry.name);
        if (entry.isSymbolicLink()) {
            claimRoot(entry.name, full);
        } else if (entry.isDirectory() && entry.name.startsWith("@") && entry.name !== ".pnpm") {
            claimScopeChildren(full, entry.name);
        } else if (entry.isDirectory() && entry.name !== ".pnpm" && entry.name !== ".prisma") {
            copyTreeContent(full, join(destRoot, entry.name));
            storeOf.set(entry.name, storeRootOf(full));
        } else if (entry.isDirectory() && entry.name === ".prisma") {
            // Generated client: real content with no store siblings of its own;
            // its requires resolve via the staging root, so no nesting.
            copyTreeContent(full, join(destRoot, entry.name));
        }
    }
    const hoistRoot = join(srcRoot, ".pnpm", "node_modules");
    if (existsSync(hoistRoot)) {
        for (const entry of readdirSync(hoistRoot, { withFileTypes: true })) {
            const full = join(hoistRoot, entry.name);
            if (!entry.isSymbolicLink() && !entry.isDirectory()) continue;
            if (entry.name.startsWith("@") && entry.isDirectory() && !entry.isSymbolicLink()) {
                claimScopeChildren(full, entry.name);
            } else {
                claimRoot(entry.name, full);
            }
        }
    }
    // Root promotion. The claims above cover direct dependencies (top level)
    // and pnpm's hoist guesses, but shared transitive packages that live only
    // in stores (@babel/*, @swc/*, ...) would otherwise be nested whole under
    // every parent that needs them (observed: 116 MB of @babel/* closure
    // under styled-jsx alone). Any name with exactly one version across all
    // observed links is promoted to the root once; nesting then prunes it
    // everywhere via providedAbove. Multi-version names are excluded: the
    // top-level/hoist winners plus nesting already disambiguate those.
    const versionCache = new Map();
    const packageVersion = (dir) => {
        if (!versionCache.has(dir)) {
            try {
                versionCache.set(dir, JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version ?? null);
            } catch {
                versionCache.set(dir, null);
            }
        }
        return versionCache.get(dir);
    };
    const linkPackageName = (link) => {
        const parts = relative(srcRoot, link).split(sep);
        const nm = parts.lastIndexOf("node_modules");
        if (nm < 0 || nm + 1 >= parts.length) return null;
        const first = parts[nm + 1];
        if (first.startsWith("@")) {
            return nm + 2 < parts.length ? `${first}/${parts[nm + 2]}` : null;
        }
        return first;
    };
    const surveyed = new Map(); // name -> { versions: Map<version, sampleLink> }
    // Survey the standalone links plus every project-store directory the
    // claims reference: nesting reads those stores (a superset of the
    // standalone subset), so single-version packages visible only there
    // (@babel/* et al.) must be found here or they nest under every parent.
    // Fixpoint: each newly promoted package's store can reveal more
    // single-version names (the babel closure arrives via core's store, which
    // nothing referenced before core was promoted). Only runtime-reachable
    // stores ever enter — dev-only stores stay out.
    const surveyedStores = new Set();
    for (;;) {
        const fresh = [srcRoot, ...storeOf.values()].filter((s) => !surveyedStores.has(s));
        if (fresh.length === 0) break;
        for (const root of fresh) {
            surveyedStores.add(root);
            for (const { link, real } of collectDirLinks(root)) {
                const name = linkPackageName(link);
                if (!name) continue;
                const version = packageVersion(real);
                if (version === null) continue;
                if (!surveyed.has(name)) surveyed.set(name, new Map());
                const versions = surveyed.get(name);
                if (!versions.has(version)) versions.set(version, link);
            }
        }
        let promoted = 0;
        for (const [name, versions] of [...surveyed.entries()].sort()) {
            if (versions.size === 1 && !storeOf.has(name)) {
                claimRoot(name, [...versions.values()][0]);
                promoted++;
            }
        }
        if (promoted === 0) break;
    }

    // npm-style nesting. A staged root package resolves siblings from the
    // staging root, but pnpm may have given it a different version in its
    // store (observed: pg-types needs postgres-array@2, root holds v3). So
    // each root package gets its store siblings nested under its own
    // node_modules — recursively, because nested packages have their own
    // store siblings (observed: hrana-client needs isomorphic-ws from another
    // store). Two bounds keep this small and terminating: the ancestor chain
    // (a cycle would revisit an ancestor; the same package legitimately nests
    // under many parents, so no global visited set) and version pruning (a
    // candidate is skipped when an ancestor level already provides that exact
    // version — shared deps nest once per resolution path, not per parent).
    // Third bound: only declared dependencies are nested. Store siblings
    // include peers and dev artifacts the package never loads (observed: the
    // prisma CLI with its studio-core and @radix-ui chains nested under an
    // alias, driving paths past 370 chars and aborting makensis); Node can
    // only load what package.json declares. Peers are deliberately excluded:
    // they resolve upward to the consumer by design, and nesting them would
    // shadow the app's copy with the store's guess.
    const depNamesOf = (pkgDir) => {
        try {
            const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
            return new Set([
                ...Object.keys(manifest.dependencies ?? {}),
                ...Object.keys(manifest.optionalDependencies ?? {}),
            ]);
        } catch {
            return null;
        }
    };
    const providedAbove = (nestedRoot, name, version) => {
        if (version === null) return false;
        let dir = nestedRoot;
        for (;;) {
            if (packageVersion(join(dir, ...name.split("/"))) === version) return true;
            if (dir === stagingDir) return false;
            const parent = dirname(dir);
            if (parent === dir) return false;
            dir = parent;
        }
    };
    const nestSiblings = (storeDir, nestedRoot, parentPkgDir, chain = []) => {
        const declared = parentPkgDir ? depNamesOf(parentPkgDir) : null;
        for (const entry of readdirSync(storeDir, { withFileTypes: true })) {
            const full = join(storeDir, entry.name);
            if (entry.isSymbolicLink()) {
                if (entry.name === ".bin" || isExcluded(entry.name)) continue;
                if (declared && !declared.has(entry.name)) continue;
                const real = realpathSync(full);
                if (chain.includes(real)) continue;
                if (providedAbove(nestedRoot, entry.name, packageVersion(real))) continue;
                const dest = join(nestedRoot, entry.name);
                if (!existsSync(dest)) {
                    copyTreeContent(real, dest);
                    nestSiblings(storeRootOf(real), join(dest, "node_modules"), dest, [...chain, real]);
                }
            } else if (entry.isDirectory() && entry.name.startsWith("@")) {
                if (entry.name === "@types") continue;
                for (const child of readdirSync(full, { withFileTypes: true })) {
                    if (!child.isSymbolicLink() && !child.isDirectory()) continue;
                    const scoped = `${entry.name}/${child.name}`;
                    if (isExcluded(scoped)) continue;
                    if (declared && !declared.has(scoped)) continue;
                    const real = child.isSymbolicLink() ? realpathSync(join(full, child.name)) : join(full, child.name);
                    if (chain.includes(real)) continue;
                    if (providedAbove(nestedRoot, scoped, packageVersion(real))) continue;
                    const dest = join(nestedRoot, scoped);
                    if (!existsSync(dest)) {
                        copyTreeContent(real, dest);
                        if (child.isSymbolicLink()) {
                            nestSiblings(storeRootOf(real), join(dest, "node_modules"), dest, [...chain, real]);
                        }
                    }
                }
            }
        }
    };
    for (const [name, storeDir] of [...storeOf.entries()].sort()) {
        const parentPkgDir = join(destRoot, name);
        nestSiblings(storeDir, join(parentPkgDir, "node_modules"), parentPkgDir);
    }

    // Turbopack externals aliases (.next/node_modules, e.g. pg-<hash>),
    // resolved by real import() at runtime. Without them the server boots but
    // every route using an external fails (observed). Materialized as content,
    // with the alias's store siblings nested under it: walk-up from an alias
    // copy reaches .next/node_modules (aliases only) and then the staging
    // root, so the alias's exact sibling versions must sit beside it —
    // mirroring the root nesting above. Absent when the build has no
    // externals.
    const externalsSrc = join(projectDir, ".next", "standalone", ".next", "node_modules");
    if (existsSync(externalsSrc)) {
        const externalsDest = join(stagingDir, ".next", "node_modules");
        rmSync(externalsDest, { recursive: true, force: true });
        for (const { link, real } of collectDirLinks(externalsSrc)) {
            const dest = join(externalsDest, relative(externalsSrc, link));
            copyTreeContent(real, dest);
            nestSiblings(storeRootOf(real), join(dest, "node_modules"), dest);
        }
        copyTreeContent(externalsSrc, externalsDest);
    }

    assertNoLinks(stagingDir);
    console.log(`Staged ${countFiles(destRoot)} module files for the bundle (standalone runtime set).`);
    for (const forbidden of [".env", ".env.local", ".env.production"]) {
        if (existsSync(join(destRoot, forbidden))) {
            throw new Error(`Refusing to stage ${forbidden} inside node_modules: secrets must never ship.`);
        }
    }
}

function countFiles(dir) {
    let count = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory() && !entry.isSymbolicLink()) count += countFiles(full);
        else if (entry.isFile()) count++;
    }
    return count;
}

// The installer tree is assembled as real files under src-tauri/staging
// (gitignored): single files copied verbatim, link-free trees copied with
// symlinks resolved, never linked. Junctions are not used anywhere: an
// absolute machine-local link can neither be committed nor trusted by the
// resource walker, which was the actual cause of two separate build breaks
// (missing-dir errors and a symlink-driven stack overflow).
function assembleStagingTree(projectDir, stagingDir) {
    rmSync(stagingDir, { recursive: true, force: true });
    // rmSync above removed it; copyFileSync does not create parents.
    mkdirSync(stagingDir, { recursive: true });
    const nextDir = join(projectDir, ".next");
    const standaloneDir = join(nextDir, "standalone");
    // A running `pnpm dev` shares .next with the production build and the two
    // corrupt each other (observed: garbage CSS bytes, missing standalone
    // output). Stop the dev server before building the installer.
    for (const required of [
        join(standaloneDir, "server.js"),
        join(standaloneDir, "package.json"),
        join(nextDir, "BUILD_ID"),
        join(nextDir, "server"),
        join(nextDir, "static"),
    ]) {
        if (!existsSync(required)) {
            throw new Error(
                `Missing build output: ${required}. Stop any running dev server ` +
                    "(`pnpm dev` shares .next and corrupts production output) and re-run."
            );
        }
    }

    copyFileSync(join(standaloneDir, "server.js"), join(stagingDir, "server.js"));
    copyFileSync(join(standaloneDir, "package.json"), join(stagingDir, "package.json"));
    // First-boot schema: the installer ships a bare data directory, so the
    // server creates its own tables from this file (see sqlite-bootstrap).
    // Without it every sign-in dies with `no such table: main.users`.
    copyFileSync(join(projectDir, "prisma", "sqlite-init.sql"), join(stagingDir, "sqlite-init.sql"));
    // The server reads its build metadata from <dir>/.next (distDir), so the
    // root-level files of standalone/.next live there too — mirroring
    // .next/standalone/.next, not the staging root. A root-level BUILD_ID
    // alone boots to "Could not find a production build", and each missing
    // manifest fails a different route at runtime (observed in the installed
    // app). Copied generically: every root-level file, never the
    // node_modules/server/static subtrees (handled by their own steps).
    mkdirSync(join(stagingDir, ".next"), { recursive: true });
    const standaloneNext = join(standaloneDir, ".next");
    for (const entry of readdirSync(standaloneNext, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        copyFileSync(join(standaloneNext, entry.name), join(stagingDir, ".next", entry.name));
    }
    mkdirSync(join(stagingDir, ".next", "server"), { recursive: true });
    cpSync(join(nextDir, "server"), join(stagingDir, ".next", "server"), {
        recursive: true,
        dereference: true,
    });
    mkdirSync(join(stagingDir, ".next", "static"), { recursive: true });
    cpSync(join(nextDir, "static"), join(stagingDir, ".next", "static"), {
        recursive: true,
        dereference: true,
    });
    // Turbopack externals aliases (.next/node_modules) are staged by
    // stageBundleModules, after the module tree they rebase onto exists.
}

async function stageBundleInputs(projectDir) {
    const stagingDir = join(projectDir, "src-tauri", "staging");
    mkdirSync(stagingDir, { recursive: true });
    assembleStagingTree(projectDir, stagingDir);
    await stageNodeRuntime(projectDir, stagingDir);
    await stageBundleModules(projectDir, stagingDir);
}

// Stage a Node.js runtime for the installer. The Rust side spawns
// `node server.js`, and end-user machines do not have Node —
// without this step the installed app cannot start its server.
// Everything lands link-free under src-tauri/staging (gitignored);
// tauri.conf.json maps it into the bundle. Skipped parts stay skipped.
console.log("\nStaging bundle inputs...");
await stageBundleInputs(PROJECT_DIR);
console.log("✓ Bundle inputs staged");

if (stageOnly) {
  console.log("\n--stage-only: stopping before the Tauri bundle step.");
  process.exit(0);
}

// Build Tauri application
console.log("\nBuilding Tauri application...");

const currentPlatform = platform();
console.log(`Current platform: ${currentPlatform}`);

let buildCommand = "pnpm tauri build";
if (target) {
  console.log(`Building for target: ${target}`);
  buildCommand += ` --target ${target}`;
} else {
  console.log("Building for current platform");
}

try {
  execSync(buildCommand, { stdio: "inherit" });
} catch {
  console.error("\n✗ Tauri build failed");
  console.error("Make sure you have the required platform dependencies:");
  console.error("  Windows: Microsoft Visual Studio C++ Build Tools");
  console.error("  macOS: Xcode Command Line Tools");
  console.error("  Linux: build-essential, libwebkit2gtk-4.1-dev, etc.");
  process.exit(1);
}

console.log("\n=========================================");
console.log("Build complete!");
console.log("=========================================");
console.log("");

// Show output location
const bundlePath = join(PROJECT_DIR, "src-tauri", "target", "release", "bundle");
console.log(`Output files are in: ${bundlePath}`);

if (existsSync(bundlePath)) {
  console.log("\nAvailable distributions:");
  try {
    const { readdirSync } = await import("node:fs");
    const dirs = readdirSync(bundlePath, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        console.log(`  ${dir.name}/`);
        const files = readdirSync(join(bundlePath, dir.name));
        for (const file of files) {
          const filePath = join(bundlePath, dir.name, file);
          const stats = statSync(filePath);
          const size = (stats.size / 1024 / 1024).toFixed(2);
          console.log(`    - ${file} (${size} MB)`);
        }
      }
    }
  } catch {
    console.log("Check the bundle directory for output files");
  }
}
