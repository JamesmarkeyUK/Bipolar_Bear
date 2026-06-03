#!/usr/bin/env python3
"""Generate the social-share (Open Graph) cards.

Produces two 1200x630 PNGs used as `og:image` / `twitter:image`:

  images/og-card.png            Main app — orange gradient + haloed bear
  images/og-card-anonymous.png  Anonymous board — yellow gradient + blindfold bear

Re-run whenever the brand bear art or copy changes. Output is committed to the
repo so Cloudflare Pages serves it statically (social crawlers can't run this).

    python3 scripts/build-og-cards.py

Requires Pillow (`pip install Pillow`).
"""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1200, 630

FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"


def diagonal_gradient(top_left, bottom_right):
    """135deg linear gradient (top-left colour -> bottom-right colour)."""
    base = Image.new("RGB", (W, H))
    px = base.load()
    tl = top_left
    br = bottom_right
    max_d = (W - 1) + (H - 1)
    for y in range(H):
        for x in range(W):
            t = (x + y) / max_d
            px[x, y] = (
                int(tl[0] + (br[0] - tl[0]) * t),
                int(tl[1] + (br[1] - tl[1]) * t),
                int(tl[2] + (br[2] - tl[2]) * t),
            )
    return base


def fit(img, target_h):
    ratio = target_h / img.height
    return img.resize((int(img.width * ratio), target_h), Image.LANCZOS)


def shadow_text(draw, xy, text, font, fill, shadow, anchor="la", spacing=10):
    x, y = xy
    # soft drop shadow for legibility on the gradient
    draw.multiline_text((x + 3, y + 3), text, font=font, fill=shadow,
                        anchor=anchor, spacing=spacing)
    draw.multiline_text((x, y), text, font=font, fill=fill,
                        anchor=anchor, spacing=spacing)


def build(out_name, grad_tl, grad_br, bear_path, title, tagline, url,
          text_color=(255, 255, 255, 255), shadow=(0, 0, 0, 90),
          title_size=92, tag_size=40, bear_h=380):
    card = diagonal_gradient(grad_tl, grad_br).convert("RGBA")

    bear = Image.open(os.path.join(ROOT, bear_path)).convert("RGBA")
    bear = fit(bear, bear_h)
    bx = 90
    by = (H - bear.height) // 2
    card.alpha_composite(bear, (bx, by))

    draw = ImageDraw.Draw(card)
    title_font = ImageFont.truetype(FONT_BOLD, title_size)
    tag_font = ImageFont.truetype(FONT_REG, tag_size)
    url_font = ImageFont.truetype(FONT_BOLD, 32)

    tag_fill = text_color[:3] + (240,)
    tx = bx + bear.width + 60
    shadow_text(draw, (tx, 205), title, title_font, text_color, shadow)
    shadow_text(draw, (tx, 335), tagline, tag_font, tag_fill, shadow)
    shadow_text(draw, (tx, H - 150), url, url_font, text_color, shadow)

    out = os.path.join(ROOT, out_name)
    card.convert("RGB").save(out, "PNG", optimize=True)
    print("wrote", out, card.size)


build(
    "images/og-card.png",
    (255, 170, 51), (255, 136, 51),
    "icons/favicons/android-chrome-512x512.png",
    "Bipolar Bear",
    "A free mood journal & survival kit\nfor living with bipolar disorder.",
    "bipolarbear.app",
)

build(
    "images/og-card-anonymous.png",
    (255, 221, 51), (240, 192, 0),
    "icons/favicons-anonymous/web-app-manifest-512x512.png",
    "Bipolar Anonymous",
    "An anonymous peer-support community\nfor people living with bipolar.",
    "bipolaranonymous.app",
    text_color=(58, 42, 5, 255), shadow=(255, 255, 255, 70),
    title_size=62, tag_size=33, bear_h=360,
)
