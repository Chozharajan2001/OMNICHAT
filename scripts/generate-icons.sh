#!/bin/bash
# Script to generate icons for OmniChat desktop app
# Requires: ImageMagick (convert command)

set -e

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "Error: ImageMagick is required to generate icons."
    echo "Install with: "
    echo "  macOS: brew install imagemagick"
    echo "  Linux: sudo apt install imagemagick"
    echo "  Windows: choco install imagemagick"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ICON_DIR="$SCRIPT_DIR/../src-tauri/icons"
SOURCE_ICON="${SOURCE_ICON:-$SCRIPT_DIR/../public/icon.png}"

# Create icons directory if it doesn't exist
mkdir -p "$ICON_DIR"

echo "Generating icons for OmniChat..."
echo "Source: $SOURCE_ICON"
echo "Output: $ICON_DIR"

# Generate PNG icons for Linux
if [ -f "$SOURCE_ICON" ]; then
    # 512x512 for Linux
    convert "$SOURCE_ICON" -resize 512x512 "$ICON_DIR/icon-512.png"
    echo "Generated: icon-512.png"
    
    # 256x256
    convert "$SOURCE_ICON" -resize 256x256 "$ICON_DIR/icon-256.png"
    echo "Generated: icon-256.png"
    
    # 128x128
    convert "$SOURCE_ICON" -resize 128x128 "$ICON_DIR/icon-128.png"
    echo "Generated: icon-128.png"
    
    # 64x64
    convert "$SOURCE_ICON" -resize 64x64 "$ICON_DIR/icon-64.png"
    echo "Generated: icon-64.png"
    
    # 32x32
    convert "$SOURCE_ICON" -resize 32x32 "$ICON_DIR/icon-32.png"
    echo "Generated: icon-32.png"
    
    # Generate ICO for Windows (if not exists)
    if [ ! -f "$ICON_DIR/icon.ico" ]; then
        convert "$SOURCE_ICON" -resize 256x256 "$ICON_DIR/icon.ico"
        echo "Generated: icon.ico"
    fi
    
    # Generate ICNS for macOS
    if command -v iconutil &> /dev/null; then
        MACOS_ICONSET="$ICON_DIR/icon.iconset"
        mkdir -p "$MACOS_ICONSET"
        
        convert "$SOURCE_ICON" -resize 16x16 "$MACOS_ICONSET/icon_16x16.png"
        convert "$SOURCE_ICON" -resize 32x32 "$MACOS_ICONSET/icon_16x16@2x.png"
        convert "$SOURCE_ICON" -resize 32x32 "$MACOS_ICONSET/icon_32x32.png"
        convert "$SOURCE_ICON" -resize 64x64 "$MACOS_ICONSET/icon_32x32@2x.png"
        convert "$SOURCE_ICON" -resize 128x128 "$MACOS_ICONSET/icon_128x128.png"
        convert "$SOURCE_ICON" -resize 256x256 "$MACOS_ICONSET/icon_128x128@2x.png"
        convert "$SOURCE_ICON" -resize 256x256 "$MACOS_ICONSET/icon_256x256.png"
        convert "$SOURCE_ICON" -resize 512x512 "$MACOS_ICONSET/icon_256x256@2x.png"
        convert "$SOURCE_ICON" -resize 512x512 "$MACOS_ICONSET/icon_512x512.png"
        convert "$SOURCE_ICON" -resize 1024x1024 "$MACOS_ICONSET/icon_512x512@2x.png"
        
        iconutil -c icns "$MACOS_ICONSET" -o "$ICON_DIR/icon.icns"
        rm -rf "$MACOS_ICONSET"
        echo "Generated: icon.icns"
    else
        echo "Warning: iconutil not found. Skipping .icns generation (macOS only)."
    fi
else
    echo "Error: Source icon not found at $SOURCE_ICON"
    echo "Please create a PNG icon file (512x512 or larger) at public/icon.png"
    exit 1
fi

echo ""
echo "Icon generation complete!"
echo "Files in $ICON_DIR:"
ls -la "$ICON_DIR"
