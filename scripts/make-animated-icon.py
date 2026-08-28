#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Guy Boldon and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Generate an animated GIF of the CoolerControl icon with a full hue rotation.

Reads the colour icon that scripts/gen-app-icons.py writes, so re-run this after
the artwork changes.
"""

import argparse
import colorsys
import io
from pathlib import Path

__VERSION__ = "1"

try:
    import cairosvg
except ImportError:
    raise SystemExit("Missing dependency: pip install cairosvg") from None

try:
    import numpy as np
    from PIL import Image
except ImportError:
    raise SystemExit("Missing dependency: pip install Pillow numpy") from None

ROOT = Path(__file__).resolve().parent.parent
SVG_PATH = ROOT / "packaging/metadata/org.coolercontrol.CoolerControl.svg"
OUTPUT_PATH = ROOT / "packaging/metadata/coolercontrol-animated.gif"

# Original gradient colors (as they appear in the SVG)
COLORS = ["#4d8cff", "#ff21ff"]

NUM_FRAMES = 36  # 10° hue steps → full 360° rotation
FRAME_MS = 80  # medium speed (~2.9 s loop)
SIZE = 512


def hex_to_hls(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    return colorsys.rgb_to_hls(r, g, b)


def hls_to_hex(h: float, lum: float, sat: float) -> str:
    r, g, b = colorsys.hls_to_rgb(h, lum, sat)
    return "#{:02x}{:02x}{:02x}".format(int(r * 255), int(g * 255), int(b * 255))


def _to_gif_frame(img: Image.Image) -> Image.Image:
    """Quantize RGBA image to 255-color palette; index 255 = transparent."""
    alpha = np.array(img.split()[3])
    p = img.convert("RGB").quantize(colors=255, method=Image.Quantize.FASTOCTREE)
    arr = np.array(p)
    arr[alpha < 128] = 255
    result = Image.fromarray(arr, "P")
    result.putpalette(p.getpalette())
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("-v", "--version", action="version", version=f"\n {__VERSION__}")
    ap.parse_args()

    svg = SVG_PATH.read_text()
    base_hls = [hex_to_hls(c) for c in COLORS]

    frames: list[Image.Image] = []
    for i in range(NUM_FRAMES):
        shift = i / NUM_FRAMES
        frame_svg = svg
        for original, (h, lum, sat) in zip(COLORS, base_hls, strict=False):
            rotated = hls_to_hex((h + shift) % 1.0, lum, sat)
            frame_svg = frame_svg.replace(original, rotated)

        png = cairosvg.svg2png(
            bytestring=frame_svg.encode(), output_width=SIZE, output_height=SIZE
        )
        frames.append(Image.open(io.BytesIO(png)).convert("RGBA"))

    # Convert to palette mode with transparency at index 255
    palette_frames = [_to_gif_frame(f) for f in frames]

    palette_frames[0].save(
        OUTPUT_PATH,
        save_all=True,
        append_images=palette_frames[1:],
        loop=0,
        duration=FRAME_MS,
        optimize=False,
        transparency=255,
        disposal=2,  # clear to background before each frame
    )
    print(
        f"Saved {OUTPUT_PATH.relative_to(ROOT)}  ({OUTPUT_PATH.stat().st_size // 1024} KB)"
    )


if __name__ == "__main__":
    main()
