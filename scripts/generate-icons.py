#!/usr/bin/env python3
"""Generate every OmniChat desktop icon from one drawn source.

The old icon.ico was an unrelated placeholder (white triangle on black), so
this draws the actual brand mark: a white four-point sparkle on the product
orange, matching the in-app Sparkles badge and --primary.

Cross-platform (Pillow only): the .sh twin needs ImageMagick + macOS iconutil
for .icns, while Pillow writes .icns anywhere.

Usage:  python3 scripts/generate-icons.py
Output: src-tauri/icons/{icon.png (1024 master), icon-512/256/128/64/32.png,
        icon.ico (multi-size), icon.icns}
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "src-tauri" / "icons"

SIZE = 1024
RADIUS = 232
TOP = (240, 122, 46)      # --primary light theme
BOTTOM = (172, 72, 16)    # deep brand orange
WHITE = (255, 255, 255, 255)


def rounded_rect(draw: ImageDraw.ImageDraw) -> None:
    draw.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=RADIUS, fill=BOTTOM)


def vertical_gradient(base: Image.Image) -> None:
    top = Image.new("RGBA", (1, SIZE), TOP + (255,))
    bottom = Image.new("RGBA", (1, SIZE), BOTTOM + (255,))
    mask = Image.linear_gradient("L").resize((1, SIZE))
    blended = Image.composite(bottom, top, mask).resize((SIZE, SIZE))
    rounded = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    mask_rect = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask_rect).rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=RADIUS, fill=255)
    rounded.paste(blended, (0, 0), mask_rect)
    base.alpha_composite(rounded)


def sparkle_points(cx: float, cy: float, outer: float, inner: float) -> list[tuple[float, float]]:
    # Four-point star: N, inner-NE, E, inner-SE, S, inner-SW, W, inner-NW.
    pts: list[tuple[float, float]] = []
    for i in range(8):
        angle = -math.pi / 2 + i * math.pi / 4
        radius = outer if i % 2 == 0 else inner
        pts.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return pts


def draw_mark() -> Image.Image:
    base = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    vertical_gradient(base)
    draw = ImageDraw.Draw(base)
    cx = cy = SIZE / 2
    draw.polygon(sparkle_points(cx, cy - 20, 300, 105), fill=WHITE)
    # Companion sparkle, lower right, like the Lucide badge.
    draw.polygon(sparkle_points(cx + 215, cy + 185, 105, 38), fill=WHITE)
    return base


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    master = draw_mark()
    master.save(ICON_DIR / "icon.png")
    print("icon.png (1024 master)")

    for side in (512, 256, 128, 64, 32):
        master.resize((side, side), Image.LANCZOS).save(ICON_DIR / f"icon-{side}.png")
        print(f"icon-{side}.png")

    master.save(ICON_DIR / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("icon.ico (multi-size, replaces the placeholder)")

    master.save(ICON_DIR / "icon.icns")
    print("icon.icns")

    print("done:", sorted(p.name for p in ICON_DIR.iterdir()))


if __name__ == "__main__":
    main()
