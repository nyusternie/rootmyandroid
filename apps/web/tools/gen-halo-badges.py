#!/usr/bin/env python3
"""apps/web/tools/gen-halo-badges.py — generate the Halo badge set
(single/double/triple) for rootmyandroid.

Usage: python3 apps/web/tools/gen-halo-badges.py apps/web/public/img

Style: matches apps/web/public/img/badge-guardian.webp family —
white canvas, cream rounded tile, kawaii android robot, gold halo ring(s).
Palette sampled from the shipped badges (2026-11-03).
Renders at 4x and downsamples (LANCZOS) for anti-aliasing.
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

S = 4                      # supersample factor
SZ = 256                   # output size
CV = SZ * S                # canvas

WHITE      = (254, 254, 254)
TILE       = (253, 246, 234)
ORANGE     = (241, 174, 78)
ORANGE_DK  = (226, 152, 58)
FACE       = (250, 221, 178)
EYE        = (58, 109, 185)
SMILE      = (196, 142, 81)
BLUSH      = (247, 176, 132)
GOLD       = (237, 163, 55)
GOLD_LT    = (246, 190, 96)
SHADOW     = (238, 226, 205)


def halo(draw, cx, cy, w, h, wd):
    """One gold ring: ellipse outline with a light top highlight."""
    box = [cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2]
    draw.ellipse(box, outline=GOLD, width=wd)
    # subtle top highlight arc for depth
    arc_box = [box[0] + wd // 2, box[1] + wd // 2, box[2] - wd // 2, box[3] - wd // 2]
    draw.arc(arc_box, start=200, end=340, fill=GOLD_LT, width=max(2, wd // 4))


def robot(draw, drop):
    """Kawaii android; `drop` shifts the whole robot down (room for halos)."""
    d = drop
    # ground shadow (soft, on its own blurred layer would be nicer; flat is fine)
    draw.ellipse([360, 826 + d, 664, 874 + d], fill=SHADOW)
    # body
    draw.rounded_rectangle([376, 612 + d, 648, 838 + d], radius=96, fill=ORANGE)
    # antennae (behind halo: they flank it)
    for x0, x1 in ((398, 344), (626, 680)):
        draw.line([x0, 352 + d, x1, 262 + d], fill=ORANGE, width=26)
        draw.ellipse([x1 - 15, 262 + d - 15, x1 + 15, 262 + d + 15], fill=ORANGE)
    # head (helmet)
    draw.rounded_rectangle([300, 342 + d, 724, 628 + d], radius=124, fill=ORANGE)
    # face plate
    draw.rounded_rectangle([342, 402 + d, 682, 586 + d], radius=88, fill=FACE)
    # eyes
    for ex in (450, 574):
        draw.ellipse([ex - 35, 460 + d, ex + 35, 530 + d], fill=EYE)
        draw.ellipse([ex - 22, 468 + d, ex - 2, 488 + d], fill=WHITE)  # highlight
    # blush
    draw.ellipse([392, 520 + d, 436, 548 + d], fill=BLUSH)
    draw.ellipse([588, 520 + d, 632, 548 + d], fill=BLUSH)
    # smile
    draw.arc([482, 512 + d, 542, 566 + d], start=20, end=160, fill=SMILE, width=12)


def render(rings, out):
    im = Image.new('RGB', (CV, CV), WHITE)
    dr = ImageDraw.Draw(im)
    # tile
    dr.rounded_rectangle([64, 64, CV - 64, CV - 64], radius=180, fill=TILE)
    # layout: n rings stacked above the head; drop robot for 2/3 rings
    n = rings['n']
    drop = {0: 0, 1: 24, 2: 56, 3: 88}[n]
    robot(dr, drop)
    head_top = 342 + drop
    gap = rings['gap']
    hw, hh, wd = rings['w'], rings['h'], rings['wd']
    lowest_cy = head_top - 92 - hh // 2
    for i in range(n):
        cy = lowest_cy - i * gap
        halo(dr, CV // 2, cy, hw, hh, wd)
    im = im.resize((SZ, SZ), Image.LANCZOS)
    im.save(out, 'WEBP', quality=92, method=6)
    print('wrote', out)


FREE   = dict(n=0, w=0, h=0, wd=0, gap=0)
SINGLE = dict(n=1, w=260, h=84, wd=26, gap=0)
DOUBLE = dict(n=2, w=244, h=74, wd=24, gap=72)
TRIPLE = dict(n=3, w=228, h=66, wd=20, gap=64)

if __name__ == '__main__':
    outdir = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
    render(FREE, f'{outdir}/badge-halo-free.webp')
    render(SINGLE, f'{outdir}/badge-halo-single.webp')
    render(DOUBLE, f'{outdir}/badge-halo-double.webp')
    render(TRIPLE, f'{outdir}/badge-halo-triple.webp')
