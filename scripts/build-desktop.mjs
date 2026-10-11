#!/usr/bin/env node
/**
 * OmniChat Desktop Build Script
 * Cross-platform build script for Tauri desktop application
 */

import { execSync } from "node:child_process";
import {
    copyFileSync,
    createWriteStream,
    existsSync,
    lstatSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    symlinkSync,
    unlinkSync,
} from "node:fs";
import { resolve, join, relative, dirname, sep } from "node:path";
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

// Resolve the newest LTS line from the official release index (no hardcoded
// version to rot) and stage its runtime binary for the installer.
async function stageNodeRuntime(projectDir) {
    const stageDir = join(projectDir, "src-tauri", ".node-dist", "node");
    const binaryName = platform() === "win32" ? "node.exe" : "node";
    if (existsSync(join(stageDir, binaryName))) {
        console.log("Node.js runtime already staged, skipping download.");
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

    const plat = platform() === "win32" ? "win" : platform() === "darwin" ? "darwin" : "linux";
    const cpu = arch() === "arm64" ? "arm64" : "x64";
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

    mkdirSync(stageDir, { recursive: true });
    try {
        execSync(`tar -xf "${downloadPath}" -C "${tmpdir()}"`, { stdio: "pipe" });
    } catch {
        throw new Error(
            "Could not extract the Node.js archive (needs tar with zip support, or unzip on Linux)"
        );
    }
    const { copyFileSync, rmSync } = await import("node:fs");
    const extractedRoot = join(tmpdir(), file.replace(`.${ext}`, ""));
    const innerBinary = platform() === "win32"
        ? join(extractedRoot, "node.exe")
        : join(extractedRoot, "bin", "node");
    // Copy, not rename: the temp dir and the project may sit on different drives.
    copyFileSync(innerBinary, join(stageDir, binaryName));
    rmSync(extractedRoot, { recursive: true, force: true });
    try {
        rmSync(downloadPath, { force: true });
    } catch {
        // Best-effort temp cleanup only.
    }
    console.log(`Staged ${lts} ${plat}-${cpu} runtime.`);
}

// The Tauri resource walker follows symlinks without cycle protection, and
// Next's standalone node_modules is a pnpm symlink forest, so globbing it
// overflows the build script's stack. Instead, the exact file set from the
// build's own .nft.json traces is materialized link-free under
// src-tauri/staged-modules (gitignored), and only that clean tree is bundled.
// Every entry is copied individually (no recursive walk through links), so
// termination does not depend on the shape of the forest.
async function stageBundleModules(projectDir) {
    const { lstatSync, readlinkSync } = await import("node:fs");
    const stageRoot = join(projectDir, "src-tauri", "staged-modules");
    rmSync(stageRoot, { recursive: true, force: true });

    const nftFiles = [];
    const walkNft = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === "standalone") continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                walkNft(full);
            } else if (entry.isFile() && entry.name.endsWith(".nft.json")) {
                nftFiles.push(full);
            }
        }
    };
    walkNft(join(projectDir, ".next"));

    const seen = new Set();
    let copied = 0;
    let skipped = 0;
    const skippedSamples = [];
    for (const nftPath of nftFiles) {
        let trace;
        try {
            trace = JSON.parse(readFileSync(nftPath, "utf8"));
        } catch {
            continue;
        }
        const base = dirname(nftPath);
        for (const file of trace.files ?? []) {
            const src = resolve(base, file);
            const rel = relative(projectDir, src);
            if (rel.startsWith("..") || !rel.startsWith(`node_modules${sep}`)) continue;
            const dest = join(stageRoot, rel);
            if (seen.has(dest)) continue;
            seen.add(dest);
            try {
                const st = lstatSync(src);
                if (st.isDirectory() && !st.isSymbolicLink()) {
                    mkdirSync(dest, { recursive: true });
                } else if (st.isSymbolicLink()) {
                    const target = resolve(dirname(src), readlinkSync(src));
                    const targetStat = statSync(target);
                    if (targetStat.isDirectory()) {
                        // Directory links materialize as real dirs; their files
                        // arrive as their own trace entries through this path.
                        mkdirSync(dest, { recursive: true });
                    } else {
                        mkdirSync(dirname(dest), { recursive: true });
                        copyFileSync(target, dest);
                        copied++;
                    }
                } else {
                    mkdirSync(dirname(dest), { recursive: true });
                    copyFileSync(src, dest);
                    copied++;
                }
            } catch {
                skipped++;
                if (skippedSamples.length < 3) skippedSamples.push(rel);
            }
        }
    }
    console.log(`Staged ${copied} module files for the bundle (${skipped} absent entries skipped).`);
    for (const sample of skippedSamples) {
        console.log(`  skipped (absent at copy time): ${sample}`);
    }
}

// tauri.conf.json references staging junctions instead of `..` globs so the
// resource walker never leaves src-tauri. Junctions embed absolute local
// paths (useless on any other machine), hence gitignored and created here,
// never committed. Re-created on every build; stale ones are replaced.
function ensureStagingJunction(projectDir) {
    const tauriDir = join(projectDir, "src-tauri");
    const link = join(tauriDir, "staged-next");
    try {
        // lstat, never stat: unlink removes the link itself, while a recursive
        // remove could walk into the target tree.
        if (lstatSync(link).isSymbolicLink() || lstatSync(link).isDirectory()) {
            unlinkSync(link);
        }
    } catch {
        // Absent is the common case; anything else fails loudly below.
    }
    symlinkSync(join(projectDir, ".next"), link, "junction");
}

async function stageBundleInputs(projectDir) {
    ensureStagingJunction(projectDir);
    await stageNodeRuntime(projectDir);
    await stageBundleModules(projectDir);
}

// Stage a Node.js runtime for the installer. The Rust side spawns
// `node server/server.js`, and end-user machines do not have Node —
// without this step the installed app cannot start its server.
// Staged under src-tauri/.node-dist (gitignored); tauri.conf.json maps it
// into the bundle at ./node. Skipped when already staged.
console.log("\nStaging bundle inputs...");
await stageBundleInputs(PROJECT_DIR);
console.log("✓ Bundle inputs staged");

// Get target from command line argument
const target = process.argv[2];

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
