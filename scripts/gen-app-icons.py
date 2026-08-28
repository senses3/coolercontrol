#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Guy Boldon and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Generate the CoolerControl app icons and every raster derived from them.

The mark is three columns, each an open C (the CoolerControl C) with a stem hung
from it, heads at top, bottom, top. All three C's share one orientation: a 270
degree ring open at the top-right quadrant. The middle column is not rotated,
its stem simply arrives from above.

Two weights are drawn from the same geometry. The symbolic icon is read at 16px
in a tray, so it takes a 1.75 band on a 16 grid and fills the box edge to edge.
The colour icon is read at 48-256px, where that weight starts closing the ring,
so it takes 1.25x the original band instead.

Usage:  scripts/gen-app-icons.py            # writes into the working tree
        scripts/gen-app-icons.py --check    # render only, touch nothing
"""
import argparse
import io
import math
import pathlib

__VERSION__ = "5"

try:
    import cairosvg
except ImportError:
    raise SystemExit("Missing dependency: pip install cairosvg") from None
try:
    from PIL import Image, ImageChops, ImageDraw
except ImportError:
    raise SystemExit("Missing dependency: pip install pillow") from None

ROOT = pathlib.Path(__file__).resolve().parent.parent
META = ROOT / "packaging/metadata"
PUBLIC = ROOT / "coolercontrol-ui/public"

# Geometry on a 16 grid. Everything else is this, scaled.
R = 2.535  # ring outer radius
CENTRES = (2.535, 8.0, 13.465)
CY = (2.535, 13.465, 2.535)  # head centres: top, bottom, top
FREE_TOP, FREE_BOT = 0.5, 15.5
GAP = 90  # the C's opening, centred on 45 degrees
BAND = 1.60  # stem and ring band, one weight for every variant
BADGE = (12.8, 12.8, 3.2)  # 40% of the box, bottom right
HALO = 0.7  # transparent gap carved around the badge
# Fraction of the canvas the mark spans. Breeze insets its tray icons by about a
# quarter; at full bleed ours was the loudest thing in the tray. Padding alone is
# not enough: it shrinks the C's hole along with everything else, and under about
# 2px at tray size the ring fills in and the mark reads mushy, so the band is
# thinned with the inset to hold the hole open (it is 2 * (R - band)).
# Every variant shares it, so the colour and symbolic marks stay interchangeable.
PAD = 0.86

MASKABLE_BG = "#1b1e23"  # manifest background_color
ICO_SIZES = (256, 64, 48, 32, 24, 16)


def _pad(v, pad):
    """Inset a 16-grid coordinate about the canvas centre."""
    return v * pad + 8 * (1 - pad)


def _pt(cx, cy, r, angle):
    return (
        cx + r * math.cos(math.radians(angle)),
        cy - r * math.sin(math.radians(angle)),
    )


def _head(cx, cy, r, band, fmt):
    """The open C, outlined as a filled path: outer arc, round cap, inner arc back,
    round cap. Each cap is two quarter arcs, never one semicircle: a 180 degree arc
    has chord == 2r exactly, and that degenerate case makes some renderers
    (cairosvg among them) drop the whole path."""
    ri, cap = r - band, band / 2
    a0, a1 = 45 + GAP / 2, 45 - GAP / 2 + 360
    large = 1 if (a1 - a0) > 180 else 0
    o0, o1 = _pt(cx, cy, r, a0), _pt(cx, cy, r, a1)
    i0, i1 = _pt(cx, cy, ri, a0), _pt(cx, cy, ri, a1)

    def _cap_mid(angle, outward):
        """Halfway round a cap: its centre sits on the mid-radius, and the point
        is one cap radius along the tangent, away from the C's body."""
        c = _pt(cx, cy, r - cap, angle)
        t = (-math.sin(math.radians(angle)), -math.cos(math.radians(angle)))
        return (c[0] + outward * cap * t[0], c[1] + outward * cap * t[1])

    mid1, mid0 = _cap_mid(a1, 1), _cap_mid(a0, -1)

    def f(p):
        return f"{p[0]:{fmt}},{p[1]:{fmt}}"

    return (
        f"M {f(o0)} A {r:{fmt}},{r:{fmt}} 0 {large},0 {f(o1)} "
        f"A {cap:{fmt}},{cap:{fmt}} 0 0,0 {f(mid1)} "
        f"A {cap:{fmt}},{cap:{fmt}} 0 0,0 {f(i1)} "
        f"A {ri:{fmt}},{ri:{fmt}} 0 {large},1 {f(i0)} "
        f"A {cap:{fmt}},{cap:{fmt}} 0 0,0 {f(mid0)} "
        f"A {cap:{fmt}},{cap:{fmt}} 0 0,0 {f(o0)} Z"
    )


def _stem(cx, y_top, y_bot, stem, fmt):
    """A stadium: both ends round. The end that meets the ring stops on the hole's
    tangent, so the hole stays a full circle; on the middle column that end sits in
    the C's opening where it is visible, which is why it is not squared off."""
    r = stem / 2
    x0, x1 = cx - r, cx + r
    return (
        f"M {x0:{fmt}},{y_top + r:{fmt}} "
        f"A {r:{fmt}},{r:{fmt}} 0 0,1 {cx:{fmt}},{y_top:{fmt}} "
        f"A {r:{fmt}},{r:{fmt}} 0 0,1 {x1:{fmt}},{y_top + r:{fmt}} "
        f"L {x1:{fmt}},{y_bot - r:{fmt}} "
        f"A {r:{fmt}},{r:{fmt}} 0 0,1 {cx:{fmt}},{y_bot:{fmt}} "
        f"A {r:{fmt}},{r:{fmt}} 0 0,1 {x0:{fmt}},{y_bot - r:{fmt}} Z"
    )


def mark(band, scale=1.0, offset=0.0, fmt="g"):
    """Returns (heads, stems) path data. They stay separate elements: as subpaths
    their winding would cancel where they overlap."""

    def s(v):
        return v * scale + offset

    r, bd = R * scale, band * scale
    ri = r - bd
    heads, stems = [], []
    for cx_u, cy_u in zip(CENTRES, CY, strict=False):
        cx, cy = s(cx_u), s(cy_u)
        heads.append(_head(cx, cy, r, bd, fmt))
        if cy_u < 8:  # head on top, stem hangs below
            stems.append(_stem(cx, cy + ri, s(FREE_BOT), bd, fmt))
        else:  # head at the bottom, stem drops into it
            stems.append(_stem(cx, s(FREE_TOP), cy - ri, bd, fmt))
    return " ".join(heads), " ".join(stems)


def _badge_defs(scale, offset, canvas, pad=1.0, indent="    "):
    """`scale`/`offset` map the 16 grid onto the canvas; `pad` insets the mark,
    the badge and the halo together, so the badge keeps the mark's margin and the
    ring keeps its width relative to the badge."""
    bx, by = (_pad(v, pad) * scale + offset for v in BADGE[:2])
    origin, box = canvas
    return (
        f"{indent}<!-- Carves a transparent gap around the badge so it reads on any\n"
        f"{indent}     background: an outline in a fixed colour cannot, since the panel\n"
        f"{indent}     colour is unknown. A renderer that ignores masks just draws the\n"
        f"{indent}     badge over the mark, which is still correct. The region is left to\n"
        f"{indent}     default: stating it makes cairosvg drop the mask, and the default\n"
        f"{indent}     (the object bounding box) already covers the canvas here. -->\n"
        f'{indent}<mask id="badge-cut">\n'
        f'{indent}  <rect x="{offset:g}" y="{offset:g}" width="{box:g}"'
        f' height="{box:g}" fill="#fff" />\n'
        f'{indent}  <circle cx="{bx:g}" cy="{by:g}"'
        f' r="{(BADGE[2] + HALO) * pad * scale:g}" fill="#000" />\n'
        f"{indent}</mask>\n"
    )


def _badge_circle(scale, offset, pad=1.0, symbolic=False):
    # GTK recolours a symbolic icon wholesale unless an element opts into one of
    # its four named colours, which would flatten the badge into the mark. The
    # class picks the theme's error colour; the fill stays as the brand red for
    # renderers that do not know the class.
    cls = ' class="error"' if symbolic else ""
    bx, by = (_pad(v, pad) * scale + offset for v in BADGE[:2])
    return (
        f'  <circle id="badge"{cls} cx="{bx:g}" cy="{by:g}"'
        f' r="{BADGE[2] * pad * scale:g}"\n'
        f'     style="fill:#dc3545" />\n'
    )


def symbolic(alert):
    k = PAD
    heads, stems = mark(BAND / k, scale=k, offset=8 * (1 - k))
    out = [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        "<!--",
        "  SPDX-FileCopyrightText: 2025 Guy Boldon and contributors",
        "  SPDX-License-Identifier: GPL-3.0-or-later",
        "",
        "  Drawn on a 16 grid: the stem is 1.60px and the mark is inset so it sits",
        "  with the other tray icons. Generated by scripts/gen-app-icons.py.",
        "-->",
        '<svg width="16" height="16" viewBox="0 0 16 16" version="1.1"',
        '   xmlns="http://www.w3.org/2000/svg">',
        "  <defs>",
        '    <style type="text/css">',
        "        .ColorScheme-Text { color:#fcfcfc; }",
        "    </style>",
    ]
    if alert:
        out.append(_badge_defs(1.0, 0.0, (0, 16), k).rstrip("\n"))
    out.append("  </defs>")
    mask = ' mask="url(#badge-cut)"' if alert else ""
    out.append(f'  <g class="ColorScheme-Text" style="fill:currentColor"{mask}>')
    out.append(f'    <path d="{heads}" />')
    out.append(f'    <path d="{stems}" />')
    out.append("  </g>")
    if alert:
        out.append(_badge_circle(1.0, 0.0, k, symbolic=True).rstrip("\n"))
    out.append("</svg>")
    return "\n".join(out) + "\n"


def colour(alert, year="2021", holders="Guy Boldon and contributors"):
    k = PAD
    heads, stems = mark(BAND / k, scale=16.0 * k, offset=8 * (1 - k) * 16.0, fmt=".3f")
    fill = 'style="fill:url(#linearGradient4)"'
    out = [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        "<!--",
        f"  SPDX-FileCopyrightText: {year} {holders}",
        "  SPDX-License-Identifier: GPL-3.0-or-later",
        "",
        "  Generated by scripts/gen-app-icons.py.",
        "-->",
        '<svg width="256" height="256" viewBox="0 0 256 256" version="1.1"',
        '   xmlns="http://www.w3.org/2000/svg">',
        "  <defs>",
        "    <!-- One gradient with its stops inlined. Splitting it in two, the second",
        "         inheriting via xlink:href, breaks cairosvg for the second element",
        "         that references it: the stems render as nothing. The viewBox starts",
        "         at 0,0 for the same reason: with a non-zero origin cairosvg places",
        "         mask content wrongly, clipping the mark and moving the halo. -->",
        '    <linearGradient id="linearGradient4" x1="0" y1="128" x2="256" y2="128"',
        '       gradientUnits="userSpaceOnUse">',
        '      <stop style="stop-color:#4d8cff;stop-opacity:1;" offset="0" />',
        '      <stop style="stop-color:#ff21ff;stop-opacity:1;" offset="1" />',
        "    </linearGradient>",
    ]
    if alert:
        out.append(_badge_defs(16.0, 0.0, (0, 256), k).rstrip("\n"))
    out.append("  </defs>")
    mask = ' mask="url(#badge-cut)"' if alert else ""
    out.append(f'  <g id="g2"{mask}>')
    out.append(f'    <path d="{heads}" id="path2" {fill} />')
    out.append(f'    <path d="{stems}" id="path3" {fill} />')
    out.append("  </g>")
    if alert:
        out.append(_badge_circle(16.0, 0.0, k).rstrip("\n"))
    out.append("</svg>")
    return "\n".join(out) + "\n"


def stamp_badge(img):
    """Punch the halo out of the mark, then draw the badge.

    The SVG carries a <mask> that says the same thing, but cairosvg does not
    honour it, so a rendered alert PNG would show the mark butted against the
    badge with no gap. Drawing it here keeps the raster right whatever renders
    the SVG, and both come from the same BADGE/HALO constants.
    """
    ss = 4  # supersample, then downscale, for clean edges
    size = img.width
    k = size / 16.0
    # PAD applies here exactly as it does in the SVG's mask, or the raster's
    # badge would sit further out and larger than the one the SVG describes.
    bx, by = (_pad(v, PAD) * k for v in BADGE[:2])
    br = BADGE[2] * PAD * k
    halo = (BADGE[2] + HALO) * PAD * k

    def circle(radius, mode, bg, fill):
        big = Image.new(mode, (size * ss, size * ss), bg)
        ImageDraw.Draw(big).ellipse(
            [
                (bx - radius) * ss,
                (by - radius) * ss,
                (bx + radius) * ss,
                (by + radius) * ss,
            ],
            fill=fill,
        )
        return big.resize((size, size), Image.LANCZOS)

    img.putalpha(ImageChops.multiply(img.getchannel("A"), circle(halo, "L", 255, 0)))
    img.alpha_composite(circle(br, "RGBA", (0, 0, 0, 0), (220, 53, 69, 255)))
    return img


def render(svg_text, size):
    png = cairosvg.svg2png(
        bytestring=svg_text.encode(), output_width=size, output_height=size
    )
    return Image.open(io.BytesIO(png)).convert("RGBA")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("-v", "--version", action="version", version=f"\n {__VERSION__}")
    ap.add_argument(
        "--check",
        action="store_true",
        help="render everything without writing, to prove the SVGs are sound",
    )
    args = ap.parse_args()

    # The alert icon was renamed from -symbolic-alert in 5.0.0. A symlink under
    # the old name sits beside it so out-of-tree packaging that still installs
    # that filename keeps building; drop it once those have caught up.
    files = {
        META / "org.coolercontrol.CoolerControl-symbolic.svg": symbolic(False),
        META / "org.coolercontrol.CoolerControl-alert-symbolic.svg": symbolic(True),
        META / "org.coolercontrol.CoolerControl.svg": colour(False),
        META / "org.coolercontrol.CoolerControl-alert.svg": colour(True),
        PUBLIC
        / "logo.svg": colour(
            False, year="2023", holders="Guy Boldon, Eren Simsek and contributors"
        ),
    }
    if args.check:
        for path, text in files.items():
            img = render(text, 512)
            opaque = sum(img.getchannel("A").histogram()[129:])
            print(f"{path.name:50} {opaque:>7} opaque px")
        return

    for path, text in files.items():
        path.write_text(text)

    base = files[META / "org.coolercontrol.CoolerControl.svg"]
    render(base, 256).save(META / "org.coolercontrol.CoolerControl.png")
    stamp_badge(render(base, 256)).save(
        META / "org.coolercontrol.CoolerControl-alert.png"
    )

    logo = files[PUBLIC / "logo.svg"]
    render(logo, 192).save(PUBLIC / "icons/app-192.png")
    render(logo, 512).save(PUBLIC / "icons/app-512.png")
    # Maskable: the mark at 70% on an opaque canvas, inside the 80% safe zone.
    canvas = Image.new("RGBA", (512, 512), MASKABLE_BG)
    box = round(360 / PAD)  # the mark's own inset would otherwise shrink it twice
    art = render(logo, box)
    canvas.alpha_composite(art, ((512 - box) // 2, (512 - box) // 2))
    canvas.convert("RGB").save(PUBLIC / "icons/app-maskable-512.png")

    ico = PUBLIC / "favicon.ico"
    render(logo, 256).save(ico, sizes=[(s, s) for s in ICO_SIZES])
    (PUBLIC / "icon/favicon.ico").write_bytes(ico.read_bytes())

    for path in files:
        print("wrote", path.relative_to(ROOT))
    print("wrote the PNG, maskable and favicon rasters")


if __name__ == "__main__":
    main()
