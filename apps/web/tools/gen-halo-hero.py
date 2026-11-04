#!/usr/bin/env python3
"""apps/web/tools/gen-halo-hero.py — generate the landing-page hero art
(Halo theme): the flat blue android robot (rooted — the roots are the
product metaphor) with a golden halo floating above its head.

Style: matches the original hero.webp — dark vignette background, flat
#3d9df2 robot, #3fb96b roots, blue sparkles. Halo gold matches the badge
family (gen-halo-badges.py). Renders at 2x, downsamples LANCZOS.

Usage: python3 apps/web/tools/gen-halo-hero.py apps/web/public/img
"""
import math
import sys
from PIL import Image, ImageDraw, ImageFilter

S = 2
SZ = 880
CV = SZ * S

BG       = (14, 15, 19)
GLOW     = (22, 30, 40)
BLUE     = (62, 158, 241)
DARK     = (14, 15, 19)
GREEN    = (63, 185, 107)
SPARK    = (74, 122, 170)
DOT      = (64, 70, 82)
GOLD     = (237, 163, 55)
GOLD_LT  = (250, 200, 110)


def plus(dr, x, y, r, w, col):
    dr.line([x - r, y, x + r, y], fill=col, width=w)
    dr.line([x, y - r, x, y + r], fill=col, width=w)


def root(dr, x0, y0, length, sway, phase, w=13):
    """Curvy tendril: sine-driven polyline with a bulb tip."""
    pts = []
    steps = 36
    for i in range(steps + 1):
        t = i / steps
        x = x0 + math.sin(t * math.pi * 1.6 + phase) * sway * t
        y = y0 + length * t
        pts.append((x, y))
    dr.line(pts, fill=GREEN, width=w, joint='curve')
    xe, ye = pts[-1]
    dr.ellipse([xe - w, ye - w, xe + w, ye + w], fill=GREEN)


def render(out):
    im = Image.new('RGB', (CV, CV), BG)
    dr = ImageDraw.Draw(im)

    # subtle central vignette glow
    glow = Image.new('L', (CV, CV), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([CV * 0.15, CV * 0.18, CV * 0.85, CV * 0.85], fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(180))
    im = Image.composite(Image.new('RGB', (CV, CV), GLOW), im, glow)
    dr = ImageDraw.Draw(im)

    # sparkles + dots (positions mirror the original hero's scatter)
    for x, y, r in ((300, 470, 26), (1430, 620, 26), (380, 1290, 26), (1410, 1280, 26)):
        plus(dr, x, y, r, 10, SPARK)
    for x, y, r in ((470, 360, 9), (1290, 420, 8), (300, 1120, 8), (1470, 1080, 10), (1180, 200, 7), (520, 1420, 8)):
        dr.ellipse([x - r, y - r, x + r, y + r], fill=DOT)

    # --- halo (own layer so we can add a soft glow) --------------------
    halo = Image.new('RGBA', (CV, CV), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hx, hy, hw, hh, wd = CV // 2, 150, 300, 92, 22
    hd.ellipse([hx - hw, hy - hh, hx + hw, hy + hh], outline=GOLD + (255,), width=wd)
    hd.arc([hx - hw + 12, hy - hh + 12, hx + hw - 12, hy + hh - 12],
           start=205, end=335, fill=GOLD_LT + (255,), width=7)
    glow2 = halo.filter(ImageFilter.GaussianBlur(26))
    im.paste(Image.alpha_composite(
        Image.new('RGBA', (CV, CV), (0, 0, 0, 0)), glow2).convert('RGB'),
        (0, 0), glow2)
    im.paste(halo.convert('RGB'), (0, 0), halo)
    dr = ImageDraw.Draw(im)

    # --- robot (shifted down to leave room for the halo) ---------------
    cx = CV // 2
    # antennae
    for x0, x1 in ((cx - 150, cx - 250), (cx + 150, cx + 250)):
        dr.line([x0, 420, x1, 300], fill=BLUE, width=34)
        dr.ellipse([x1 - 26, 300 - 26, x1 + 26, 300 + 26], fill=BLUE)
    # head dome
    dr.pieslice([cx - 330, 300, cx + 330, 960], start=180, end=360, fill=BLUE)
    dr.rectangle([cx - 330, 615, cx + 330, 630], fill=BLUE)
    # eyes
    for ex in (cx - 130, cx + 130):
        dr.ellipse([ex - 44, 470, ex + 44, 558], fill=DARK)
    # body
    dr.rounded_rectangle([cx - 300, 726, cx + 300, 1080], radius=70, fill=BLUE)
    # arms
    dr.rounded_rectangle([cx - 420, 740, cx - 330, 1050], radius=45, fill=BLUE)
    dr.rounded_rectangle([cx + 330, 740, cx + 420, 1050], radius=45, fill=BLUE)
    # roots
    root(dr, cx - 230, 1080, 420, 120, 0.4)
    root(dr, cx - 90, 1080, 500, 90, 2.4)
    root(dr, cx + 40, 1080, 540, 60, 1.2)
    root(dr, cx + 170, 1080, 470, 100, 3.6)
    root(dr, cx + 300, 1080, 380, 110, 5.2)

    im = im.resize((SZ, SZ), Image.LANCZOS)
    im.save(out, 'WEBP', quality=90, method=6)
    print('wrote', out)


if __name__ == '__main__':
    outdir = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
    render(f'{outdir}/hero-halo.webp')
