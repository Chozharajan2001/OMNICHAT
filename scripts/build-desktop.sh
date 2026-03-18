#!/bin/bash
# OmniChat Desktop Build Script
# Builds the Tauri desktop application for all platforms

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."

echo "========================================="
echo "OmniChat Desktop Build Script"
echo "========================================="
echo ""

# Check for required tools
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "Error: pnpm is required"
    exit 1
fi

if ! command -v rustc &> /dev/null; then
    echo "Error: Rust is required"
    exit 1
fi

echo "✓ Node.js: $(node --version)"
echo "✓ pnpm: $(pnpm --version)"
echo "✓ Rust: $(rustc --version)"
echo ""

# Change to project directory
cd "$PROJECT_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    pnpm install
fi

# Generate Prisma client
echo "Generating Prisma client..."
pnpm prisma generate

# Build Next.js application
echo "Building Next.js application..."
pnpm build

# Check if standalone output exists
if [ ! -d ".next/standalone" ]; then
    echo "Error: Next.js standalone output not found!"
    echo "Make sure next.config.ts has 'output: \"standalone\"'"
    exit 1
fi

echo "✓ Next.js build complete"
echo ""

# Build Tauri application
echo "Building Tauri application..."

# Default to current platform
TARGET="${1:-}"

if [ -n "$TARGET" ]; then
    echo "Building for target: $TARGET"
    pnpm tauri build --target "$TARGET"
else
    echo "Building for current platform"
    pnpm tauri build
fi

echo ""
echo "========================================="
echo "Build complete!"
echo "========================================="
echo ""
echo "Output files are in: $PROJECT_DIR/src-tauri/target/release/bundle/"
echo ""
echo "Available distributions:"
ls -la "$PROJECT_DIR/src-tauri/target/release/bundle/" 2>/dev/null || echo "Check the bundle directory for output files"
