#!/usr/bin/env node
/**
 * OmniChat Desktop Build Script
 * Cross-platform build script for Tauri desktop application
 */

import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { platform } from "node:os";

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
} catch (error) {
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
