#!/usr/bin/env bash
# tools/assets/og-device-batch.sh — one-off per-device OG art batch driver
# (2026-11-08; run from apps/web). Reads tools/assets/og-batch.txt lines of
# "slug|Title", renders tools/assets/og-device-prompt.txt with {TITLE}
# substituted via the image-generation skill's gen-image.py (nano-gpt
# credential, gemini-3-pro-image-preview), center-crops to 1200x630 into
# public/img/devices/<slug>.png, and OCR-verifies "rootmyandroid.com"
# (tesseract). Resumable: existing final PNGs are skipped. Source renders
# stay in ~/Downloads/og-devices/. Usage: bash tools/assets/og-device-batch.sh START COUNT
set -u
cd "$(dirname "$0")/../.."
MANIFEST=tools/assets/og-batch.txt
TPL=tools/assets/og-device-prompt.txt
GEN=/root/.pi/agent/skills/image-generation/scripts/gen-image.py
RAW=~/Downloads/og-devices
OUT=public/img/devices
LOG=~/Downloads/og-devices/qa.log
START=${1:-1}; COUNT=${2:-10}
mkdir -p "$RAW" "$OUT"

python3 - "$MANIFEST" "$TPL" "$GEN" "$RAW" "$OUT" "$LOG" "$START" "$COUNT" <<'PYEOF'
import os, subprocess, sys
from PIL import Image

manifest, tpl, gen, raw, out, log, start, count = sys.argv[1:9]
start, count = int(start), int(count)
template = open(tpl).read().strip()
lines = [l.rstrip('\n') for l in open(manifest) if '|' in l]
batch = lines[start - 1 : start - 1 + count]

def crop_1200x630(src, dst):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    target = 1200 / 630
    if w / h > target:  # too wide -> crop width
        nw = int(h * target)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:               # too tall -> crop height
        nh = int(w / target)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    im = im.resize((1200, 630), Image.LANCZOS)
    im.save(dst, 'PNG')

with open(log, 'a') as lg:
    for line in batch:
        slug, title = line.split('|', 1)
        final = os.path.join(out, f'{slug}.png')
        if os.path.exists(final):
            lg.write(f'SKIP {slug} (exists)\n'); lg.flush(); continue
        raw_base = os.path.join(raw, slug)
        prompt = template.replace('{TITLE}', title)
        ok = False
        for attempt in (1, 2):
            r = subprocess.run(
                ['python3', gen, prompt, raw_base, '--aspect', '1.91:1 wide landscape banner (1200x630)'],
                capture_output=True, text=True, timeout=600)
            if r.returncode == 0:
                ok = True
                lg.write(f'GEN {slug}: {r.stdout.strip()[-160:]}\n'); break
            lg.write(f'FAIL {slug} attempt {attempt}: {(r.stdout + r.stderr).strip()[-200:]}\n')
        if not ok:
            lg.flush(); continue
        src = next((f'{raw_base}.{ext}' for ext in ('png', 'jpg', 'jpeg') if os.path.exists(f'{raw_base}.{ext}')), None)
        if not src:
            lg.write(f'FAIL {slug}: no rendered file found\n'); lg.flush(); continue
        crop_1200x630(src, final)
        ocr = subprocess.run(['tesseract', final, '-'], capture_output=True, text=True).stdout
        verdict = 'OCR-OK' if 'rootmyandroid.com' in ocr.lower().replace(' ', '') else 'OCR-FLAG'
        lg.write(f'{verdict} {slug}: {" ".join(ocr.split())[:150]}\n')
        lg.flush()
print('batch done:', len(batch))
PYEOF
