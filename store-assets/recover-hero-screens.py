#!/usr/bin/env python3
"""Recover flat app screenshots out of the rendered App Store hero images.

The raw captures `build-hero.mjs` / `build-anon-hero.mjs` consume
(`out/iphone-real/`, `out/anonymous/hero-src/`) are regenerated on demand and
are not kept in the repo — but the rendered heroes ARE. Those scripts place
each phone at a known left/top/width and tilt, so a screen can be recovered
exactly: rotate the canvas back about the phone's centre, then crop the screen
rect (18px frame padding, the same `height:calc((w - 36) * 2.1679)` ratio
`screens/shared.css` uses for `.device .screen`).

The result is a clean, background-free screenshot that `build-og-cards.mjs`
re-frames in CSS. Re-run this only when the hero renders change.

    cd store-assets && python3 recover-hero-screens.py   ->  out/og-src/*.png

Requires Pillow (`pip install Pillow`).
"""

import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "og-src")

PAD, RATIO = 18, 2.1679          # shared.css .device padding + screen ratio


def recover(src, left, top, width, deg, out_name):
    """Undo one phone's placement and crop its screen."""
    img = Image.open(os.path.join(HERE, src)).convert("RGB")
    sw = width - 2 * PAD
    sh = sw * RATIO
    cx = left + width / 2
    cy = top + (sh + 2 * PAD) / 2
    # CSS rotate(+deg) is clockwise; PIL rotate(+deg) is counter-clockwise, so
    # passing the CSS angle straight through undoes the tilt.
    flat = img.rotate(deg, center=(cx, cy), resample=Image.BICUBIC)
    shot = flat.crop((round(cx - sw / 2), round(cy - sh / 2),
                      round(cx + sw / 2), round(cy + sh / 2)))
    os.makedirs(OUT, exist_ok=True)
    shot.save(os.path.join(OUT, out_name))
    print(f"og-src/{out_name}  {shot.width}x{shot.height}")


# ── Bipolar Bear (build-hero.mjs) ──────────────────────────────────────
# The mood phone spans the seam of the two heroes, so it is only whole in the
# stitch preview; the home phone sits entirely inside hero 1.
recover("out/hero/_stitch-preview.png", 1040, 712, 740, 6, "screen-mood.png")
recover("out/iphone/01-hero.png", 150, 900, 700, -7, "screen-home.png")

# ── Bipolar Anonymous (build-anon-hero.mjs — identical geometry) ───────
recover("out/anonymous/iphone/01-hero.png", 150, 900, 700, -7, "screen-anon-feed.png")
