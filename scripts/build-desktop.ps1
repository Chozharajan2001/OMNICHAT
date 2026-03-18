# OmniChat Desktop Build Script for Windows
# Builds the Tauri desktop application

param(
    [string]$Target = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "OmniChat Desktop Build Script" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check for required tools
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js is required" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: pnpm is required" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Rust is required" -ForegroundColor Red
    exit 1
}

Write-Host "OK Node.js: $(node --version)" -ForegroundColor Green
Write-Host "OK pnpm: $(pnpm --version)" -ForegroundColor Green
Write-Host "OK Rust: $(rustc --version)" -ForegroundColor Green
Write-Host ""

# Change to project directory
Set-Location $ProjectDir

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    pnpm install
}

# Generate Prisma client
Write-Host "Generating Prisma client..." -ForegroundColor Yellow
pnpm prisma generate

# Build Next.js application
Write-Host "Building Next.js application..." -ForegroundColor Yellow
pnpm build

# Check if standalone output exists
if (-not (Test-Path ".next\standalone")) {
    Write-Host "Error: Next.js standalone output not found!" -ForegroundColor Red
    Write-Host "Make sure next.config.ts has 'output: ""standalone""'" -ForegroundColor Red
    exit 1
}

Write-Host "OK Next.js build complete" -ForegroundColor Green
Write-Host ""

# Build Tauri application
Write-Host "Building Tauri application..." -ForegroundColor Yellow

if ($Target) {
    Write-Host "Building for target: $Target" -ForegroundColor Yellow
    pnpm tauri build --target $Target
} else {
    Write-Host "Building for current platform" -ForegroundColor Yellow
    pnpm tauri build
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Build complete!" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$BundlePath = Join-Path $ProjectDir "src-tauri\target\release\bundle"
Write-Host "Output files are in: $BundlePath" -ForegroundColor Green
Write-Host ""

if (Test-Path $BundlePath) {
    Write-Host "Available distributions:" -ForegroundColor Yellow
    Get-ChildItem $BundlePath -Directory | ForEach-Object {
        Write-Host "  $($_.Name)" -ForegroundColor White
        Get-ChildItem $_.FullName -File | ForEach-Object {
            Write-Host "    - $($_.Name)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "Check the bundle directory for output files" -ForegroundColor Yellow
}
