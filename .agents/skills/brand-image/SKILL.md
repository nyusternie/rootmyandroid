---
name: brand-image
description: Root My Android brand canon for generated imagery — palette, the two robot characters (SU superhero default, Guardian Angel halo), asset specs and ship procedure. Use together with the generic workspace `image-generation` skill (which owns the nano-gpt API mechanics and gen-image.py) for ANY rootmyandroid site/app image task.
---

# brand-image (rootmyandroid)

Engine: the workspace-level `image-generation` skill provides `gen-image.py`, verified
nano-gpt model roster, and QA doctrine. This file is the PROJECT layer: what to draw.

## Brand tokens (owner-set, 2026-11-04)

- **Robot body: ANDROID GREEN `#3DDC84`** — owner: "ALL ROBOTS GREEN! THAT IS ANDROID!"
  (Legacy blue `#3D9DF2` robots are superseded; legacy root-tendril art is retired.)
- Cape red `#E23A3A`; chest shield: yellow diamond `#F7D154` with bold red letters "SU".
- Halo gold `#EDA537` (Guardian Angel + Halo-currency badges only).
- Background near-black navy `#0E0F13`; headline white `#EAF1FA`; the word "FULL" and the
  URL line in sky blue `#3D9DF2` / dim `#8AB8E8` (site accent stays blue; only robots are green).

## Character canon (owner-set, 2026-11-04)

1. **SU superhero — the Root My Android DEFAULT robot.** Green body, red cape, yellow
   diamond chest shield with red "SU" (= superuser; also sidesteps DC's 'S' trademark).
   NO halo. Canon prompt: `references/su-mascot-prompt.txt`.
2. **Guardian Angel — the `com.rootmyandroid.guardian` app robot.** Green body, thin
   golden halo, NO cape. Canon prompt: `references/guardian-angel-prompt.txt`.
3. Halo rings (1/2/3) remain the Halo-currency tier badges on `/pricing` — currency
   marks, not mascots.
4. **App icons show the FULL BODY** — owner rejected a head-only icon ("looks like
   Dracula", "SU floats with no body"). Never ship head-only icon crops.

## Asset specs + pipelines (match what's live)

| Asset | Size | Format | Pipeline |
|---|---|---|---|
| `public/og-image.png` | 1200x630 | PNG optimize | full-art wide prompt (1.91:1, headline+URL rendered by model) → center-crop exact. Canonical = SU robot |
| `public/img/brand/og-variant-N-*.png` | 1200x630 | PNG | review shelf, unlinked pages |
| `public/img/hero-halo.webp` | 880x880 | webp q84 | square SU prompt → center-crop → resize (filename kept to avoid markup churn) |
| `public/apple-touch-icon.png` | 180x180 | PNG | full-body-on-tile prompt → auto-crop tile bbox (non-white diff) → resize |
| `public/icon.svg` | 24 viewBox | SVG | hand-maintained vector (green SU robot: cape + chest diamond, letters omitted at 24px) |
| `public/img/brand/guardian-angel.webp` | 512x512 | webp q88 | square Guardian prompt → resize |
| `public/img/badge-halo-*.webp` | 256x256 | webp q90 | PIL ring overlays (`apps/web/tools/gen-halo-badges.py`) |

- Source arts (jpg) for every published raster live in `apps/web/tools/assets/` — commit
  them so derivatives/reruns are free. Fallback local compositor: `apps/web/tools/gen-og-image.py`
  (Inter font, `apps/web/tools/fonts/`) — fallback only; the model renders typography.
- Headline for OG posters is the landing H1 verbatim: "Unlock the FULL power of your
  Android phone." + "rootmyandroid.com" subline.

## Ship procedure

Branch → commit → push → PR → CI green → merge → verify live (sha256 hash-compare each
asset, expect 200 + MATCH) → report ALL links (canonical + variants) and per-image costs.
Open question parked: `/rooted` page art (`hero.webp`, roots+padlock) — topical exception,
owner has not called it.
