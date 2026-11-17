#!/usr/bin/env python3
"""apps/android/tools/gen-launcher-icons.py — generate the launcher icon set
for the Root My Android Android edition from the canonical SU superhero
render (apps/web/public/img/hero-su.webp, owner-approved brand art).

Derives (no typography, full-body robot per .agents/skills/brand-image/ —
head-only icons are banned):
  - legacy mipmap ic_launcher.png / ic_launcher_round.png (48..192 px)
  - adaptive layers (mipmap-anydpi-v26 XML + foreground/background PNGs
    108..432 px): foreground = robot inside the 66dp safe zone, background
    = solid brand near-black navy #0E0F13
  - the Triple-T listing icon at 512x512
    (apps/android/metadata/com.rootmyandroid/en-US/icon.png)

Robot extraction: tight bbox over pixels that differ strongly from the
#0E0F13 background (bright body/cape/shield only — dim sparkles excluded),
then scaled per tile with the robot centered.

Usage: python3 apps/android/tools/gen-launcher-icons.py
"""
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))          # apps/android/tools
ROOT = os.path.dirname(HERE)                                # apps/android
HERO = os.path.join(os.path.dirname(ROOT), "web/public/img/hero-su.webp")
RES = os.path.join(ROOT, "android/app/src/main/res")
TRIPLE_T = os.path.join(ROOT, "android/app/src/fdroid/play/listings/en-US")
FDMETA = os.path.join(ROOT, "metadata/com.rootmyandroid")

BG = (14, 15, 19)          # #0E0F13 brand near-black navy
DIFF = 40                  # strong-diff threshold: body/cape/shield only

LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144,
          "xxxhdpi": 192}
ADAPTIVE = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324,
            "xxxhdpi": 432}


def robot_image():
    im = Image.open(HERO).convert("RGB")
    px = im.load()
    w, h = im.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if max(abs(r - BG[0]), abs(g - BG[1]), abs(b - BG[2])) > DIFF:
                xs.append(x)
                ys.append(y)
    box = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    return im.crop(box)


def paste_robot(canvas_size, robot, fraction):
    """Center the robot on a BG tile; robot height = fraction * size."""
    tile = Image.new("RGB", (canvas_size, canvas_size), BG)
    rh = int(canvas_size * fraction)
    rw = int(robot.width * rh / robot.height)
    if rw > canvas_size * 0.92:  # never overflow horizontally
        rw = int(canvas_size * 0.92)
        rh = int(robot.height * rw / robot.width)
    r = robot.resize((rw, rh), Image.LANCZOS)
    tile.paste(r, ((canvas_size - rw) // 2, (canvas_size - rh) // 2))
    return tile


def round_mask(tile):
    m = Image.new("L", tile.size, 0)
    from PIL import ImageDraw
    ImageDraw.Draw(m).ellipse((0, 0, tile.size[0] - 1, tile.size[1] - 1),
                              fill=255)
    out = Image.new("RGBA", tile.size)
    out.paste(tile, (0, 0), m)
    return out


def main():
    robot = robot_image()
    n = 0
    for dpi, size in LEGACY.items():
        d = os.path.join(RES, f"mipmap-{dpi}")
        os.makedirs(d, exist_ok=True)
        sq = paste_robot(size, robot, 0.68)
        sq.save(os.path.join(d, "ic_launcher.png"), optimize=True)
        round_mask(sq).save(os.path.join(d, "ic_launcher_round.png"),
                            optimize=True)
        n += 2
    for dpi, size in ADAPTIVE.items():
        d = os.path.join(RES, f"mipmap-{dpi}")
        paste_robot(size, robot, 0.58).save(  # 66/108 ≈ 0.61 safe zone
            os.path.join(d, "ic_launcher_background.png"), optimize=True)
        fg = paste_robot(size, robot, 0.58)
        # adaptive foreground must be transparent outside the robot
        rgba = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        # paste robot cut: reuse the composed tile's robot position
        fg_rgb = fg.load()
        rgba_px = rgba.load()
        for y in range(size):
            for x in range(size):
                r, g, b = fg_rgb[x, y]
                if max(abs(r - BG[0]), abs(g - BG[1]), abs(b - BG[2])) > 12:
                    rgba_px[x, y] = (r, g, b, 255)
        rgba.save(os.path.join(d, "ic_launcher_foreground.png"),
                  optimize=True)
        n += 2
    anydpi = os.path.join(RES, "mipmap-anydpi-v26")
    os.makedirs(anydpi, exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(os.path.join(anydpi, name), "w") as f:
            f.write(
                '<?xml version="1.0" encoding="utf-8"?>\n'
                '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                '    <background android:drawable="@mipmap/ic_launcher_background"/>\n'
                '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
                '</adaptive-icon>\n')
        n += 1
    icon512 = os.path.join(TRIPLE_T, "graphics", "icon")
    os.makedirs(icon512, exist_ok=True)
    hi = paste_robot(512, robot, 0.72)
    hi.save(os.path.join(icon512, "icon.png"), optimize=True)
    hi.save(os.path.join(FDMETA, "icon.png"), optimize=True)
    n += 1
    print(f"generated {n} files from {robot.size[0]}x{robot.size[1]} robot")


if __name__ == "__main__":
    sys.exit(main())
