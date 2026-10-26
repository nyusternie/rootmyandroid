# HANDOFF.md — Root My Android

**Handoff date:** 2026-10-26
**Audience:** the team taking over this project.
**Companion doc:** [AGENTS.md](AGENTS.md) — the standing working rules. Those
rules still apply unless the new owner explicitly changes them.

This document is public (the repo is public). It therefore contains no
secrets, account numbers, or business internals — only pointers. Everything
listed under "Not in this repo" must be transferred out-of-band.

---

## 1. What this product is

Root My Android (https://rootmyandroid.com) is a paid service that analyzes a
physical Android device and produces a rooting / upgrade plan. Account model
is Mullvad-style: a random 16-digit account number, no email, no password.
Revenue is Nitro credit (in-account unit; $5 = 100 Nitro, tiered packs) that
pays for three PRO services, priced server-side by the API:

| Service         | Nitro | Billed on                                                  |
| --------------- | ----- | ---------------------------------------------------------- |
| `cloud_backup`  | 20    | Registering one encrypted backup (5 GB per-account cap)    |
| `guardian_sync` | 10    | Pairing a NEW Guardian device (re-syncs are free)          |
| `audit_report`  | 5     | First save into a (device, audit_type) slot (refresh free) |

The API's price table is the single source of truth; the web UI renders
prices dynamically from `GET /v1/nitro/services`. Never hard-code prices in a
client. Changing a price requires owner approval and is locked by an API test.

## 2. Live system inventory

| Piece                  | What / where                                                  |
| ---------------------- | ------------------------------------------------------------- |
| Marketing/docs site    | This repo (`apps/web`) → Cloudflare Pages project `rootmyandroid` |
| API                    | `rootmyandroid.com/v1` — Cloudflare Worker `rootmyandroid-api`. **Source is NOT in this repo** (see §9) |
| Payments               | A single hosted crypto payment rail, integrated in the API worker + the whitelabel checkout pages in `apps/web` (`/account`, `/pay`). Provider account is owned out-of-band |
| Analytics              | Simple Analytics (script in `apps/web/src/layouts/Base.astro`) |
| Coverage               | Codecov (uploaded by CI; `codecov.yml` in repo root)          |
| Mobile apps            | `apps/rooted` (`com.rootmyandroid.rooted`), `apps/guardian` (`com.rootmyandroid.guardian`) — React Native 0.88 |
| Android release keystore | `.keystore/` exists on the previous maintainer's machine only — intentionally untracked. Transfer out-of-band |

## 3. Repository map

```
/
├── AGENTS.md               # Standing working rules (read second)
├── HANDOFF.md              # This file (read first)
├── apps/
│   ├── web/                # Astro 7 static site → dist/ → Cloudflare Pages
│   │   ├── src/pages/      # /, /account, /audit, /backup-audit, /guides,
│   │   │                   # /nitro, /pay, /privacy, /profile, /refunds,
│   │   │                   # /roms, /terms + /account/payment/* rewrite
│   │   ├── src/scripts/    # Vanilla TS: account.ts, audit.ts, deposit.ts,
│   │   │                   # payment.ts (the ONLY client JS, app pages only)
│   │   ├── src/content/    # Astro content collections: guides/*.md, roms/*.md
│   │   ├── src/layouts/Base.astro  # Shell: header/footer, ALL sitewide SEO
│   │   └── public/         # robots.txt, _redirects, favicons, og-image.png
│   ├── rooted/             # RN 0.88 app — scaffold stage, jest smoke test
│   └── guardian/           # RN 0.88 app — scaffold stage, jest smoke test
├── packages/               # Empty; shared workspace packages go here
├── .github/workflows/web.yml  # CI + deploy (the only workflow)
├── .vendor/                # hermes-compiler tarball (registry fetch workaround)
├── pnpm-workspace.yaml     # Hoisted linker + hermes override (do not remove)
└── package.json            # Root scripts only
```

## 4. Toolchain (verified versions)

| Tool    | Version    | Where pinned                              |
| ------- | ---------- | ----------------------------------------- |
| Node    | >= 18.17 (CI uses 22) | `package.json` engines, `web.yml` |
| pnpm    | 11.21.0    | `packageManager` in root `package.json`, `web.yml` |
| Astro   | 7.4.0      | `apps/web/package.json`                   |
| @astrojs/sitemap | 3.7.4 | `apps/web/package.json` (no Astro peer dep; build-verified on 7.4.0) |
| TypeScript | 6.0.3   | `apps/web/package.json`                   |
| vitest  | 3.2.4      | `apps/web/package.json`                   |
| React Native | 0.88.0 | `apps/rooted`, `apps/guardian` package.json |
| React   | 19.3.0     | same                                      |
| wrangler | 4.151.0   | root `package.json` devDependency         |

## 5. Build, test & deploy pipeline

Single workflow: `.github/workflows/web.yml`.

1. Triggers: push to `master`, PRs targeting `master`. Runs on a
   **self-hosted runner** labeled `[self-hosted, blackhost]`. Outside-contributor
   PRs require maintainer approval (repo Actions setting) — the repo is public
   and the runner is self-hosted, do not weaken this.
2. `test` job: `pnpm install --frozen-lockfile` → `pnpm --filter
   rootmyandroid-web check` (astro check) → `test:coverage` (vitest) → Codecov
   upload → `build`.
3. `deploy` job (master pushes only, `environment: production`): rebuilds and
   runs `wrangler pages deploy apps/web/dist --project-name rootmyandroid
   --branch master` via `cloudflare/wrangler-action`.
4. GitHub secrets consumed (names only): `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, `CODECOV_TOKEN`.

Notes:

- `pnpm test` at the root runs ALL workspace tests, including the RN apps'
  jest suites — keep them green per AGENTS.md rule 1.
- Cloudflare's edge can serve the previous HTML for a few minutes after a
  deploy (observed during the 2026-10-25 SEO deploy); hard-refresh before
  concluding a deploy is broken.
- `public/_redirects` contains one deliberate rewrite:
  `/account/payment/* → /pay/ 200` (invoice shell). The target must stay
  outside the splat or Pages loops on index.html normalization — see the
  comment in that file.

## 6. Web SEO — current state and roadmap

### 6.1 Phase 1 — SHIPPED (2026-10-25, commits `86471c8` + `133ef8a`)

- `@astrojs/sitemap` → `sitemap-index.xml` (14 URLs at ship time) +
  `public/robots.txt` referencing it.
- `Base.astro`: `og:image` (+ width/height/alt), `og:site_name`,
  `twitter:card=summary_large_image`, `theme-color #0d0f12`, real favicons
  (`public/icon.svg` brand shield + 180 px `apple-touch-icon.png` rasterized
  from it), Organization + WebSite JSON-LD.
- `/` (landing only): SoftwareApplication + Offer ($5.00 USD) JSON-LD that
  mirrors the visible "$5/month" copy.
- `public/og-image.png` (1200×630) — AI-generated (see 6.4), dark brand
  palette, verified visually once then by metadata.

All verified live post-deploy (robots 200, sitemap 200, og-image 200
image/png, meta present on homepage and inner pages).

### 6.2 Phase 2 — NOT STARTED: landing-page rebuild (`apps/web/src/pages/index.astro`)

Goal: make `/` rank for the product's actual search phrases. Current H1 is
"Free your mobile OS." — it contains neither "root" nor "Android".

Spec agreed with the previous maintainer:

1. **H1 rewritten to carry the search phrase** (e.g. "Root your Android
   device — with a plan matched to your exact model"); the brand line moves to
   a subheading.
2. **New sections**, in order: How it works (3 illustrated steps) → what the
   scan detects (bootloader status, current build, root-method and ROM match —
   copy strictly limited to what the product actually does; AGENTS.md rule
   3/5 forbids invented device claims) → ROM catalog teaser linking to
   `/roms` → guides teaser linking to `/guides` → **FAQ (static HTML
   accordion)** → pricing → existing privacy section (retained).
3. **FAQPage JSON-LD** added to `/` alongside the visible FAQ. This was
   deliberately deferred from Phase 1: structured data must mirror visible
   content, and there was no FAQ on the page yet. The two must ship together.
4. Constraints: zero client JS on `/` (AGENTS.md rule 4 — a `<details>`-based
   accordion needs no JS); every current section's intent preserved;
   pricing/payment copy changes only with owner sign-off (the landing says
   "$5/month payable by card or crypto" while the privacy panel says payments
   are crypto — aligning this copy was flagged but NOT decided).
5. Definition of done: `pnpm check`, `pnpm test`, `pnpm build` all pass;
   FAQPage schema validates (Google Rich Results Test); sitemap still
   generates; no JS shipped on `/`.

### 6.3 Phase 3 — NOT STARTED: illustration set

Remaining assets to generate (same workflow as 6.4):

1. Hero illustration for `/` (used by the Phase 2 layout).
2. Three step illustrations for How-it-works (account number → connect device
   → plan).
3. Optional: per-ROM logos/badges for `/roms` cards (check each ROM
   project's brand license first — do not assume permission).

Constraints: flat vector style, background `#0d0f12`, accent `#3d9df2`,
secondary green `#3fb96b` (from `apps/web/src/styles/global.css`); static
files under `apps/web/public/`; optimize weight (the 432 KB og-image is the
upper bound, not the target); `alt` text on every `<img>`.

### 6.4 Asset-generation workflow (used for og-image.png)

- Provider: NanoGPT, OpenAI-compatible API at `https://nano-gpt.com/api/v1`.
  The API key was supplied out-of-band to the previous maintainer's local
  tooling; **it is not in this repo and must never be committed** (AGENTS.md
  rule 3a). Obtain it (or a replacement provider) via the access-transfer
  checklist (§9).
- Discover image models: `GET /api/v1/images/models` (the chat `/models`
  endpoint lists different IDs; an image model ID from `/models` is rejected
  by `/images/generations` — verified).
- Model used: `ideogram/v4.5` (chosen for accurate in-image text; FLUX.3
  Klein also advertises typography). Note its size parameter rejects
  arbitrary dimensions — request default size and crop post-hoc.
- Post-process: ImageMagick center-crop to 1.91:1 then resize —
  `convert raw.png -gravity center -crop 1024x536+0+0 +repage -resize
  1200x630! og-image.png`. Inkscape is available for SVG→PNG rasterization
  (used for `apple-touch-icon.png`).
- Verify output: one visual check max, thereafter metadata only
  (`identify`, `du`) — do not load binaries into agent context.

### 6.5 Deferred SEO ideas (not scheduled)

- `noindex` on app-shell pages (`/pay`, `/account`, `/profile`,
  `/account/payment/*`) — they are currently in the sitemap.
- Guides content expansion — only with device-accurate, verifiable content
  (AGENTS.md rule 5).
- Search-engine webmaster verification (Search Console / Bing) once the new
  team controls the domain accounts.

## 7. Mobile apps state

Both RN apps are at scaffold stage (RN 0.88 new-app template + a jest smoke
test, `__tests__/App.test.tsx`). There is no product logic in them yet. The
package names (`com.rootmyandroid.rooted`, `com.rootmyandroid.guardian`) are
referenced by AGENTS.md rule 6 — the data-wipe rule that exists because of a
real incident (a launcher `pm clear` destroyed a home-screen layout).
Preserve that rule.

## 8. Operational gotchas

- **Hoisted node_modules**: `nodeLinker: hoisted` in `pnpm-workspace.yaml`
  is required by Metro/gradle; removing it breaks the RN builds.
- **Vendored hermes**: `pnpm-workspace.yaml` overrides `hermes-compiler` to
  `.vendor/hermes-compiler-260318099.0.4.tgz` because the 19 MB registry
  fetch exceeded the previous host's timeout. Re-evaluate on better
  connectivity, but keep CI green.
- **`allowBuilds` / `onlyBuiltDependencies`** (esbuild, workerd) are both
  required for a clean `pnpm install --frozen-lockfile` on pnpm 11.
- **Checkout self-healing**: payment crediting reconciles terminal payments
  server-side on status polls — webhook delivery is not on the critical path.
  Do not "fix" this without understanding it.
- **Device safety**: AGENTS.md rule 6 (never wipe third-party app data;
  explicit same-turn confirmation for any wipe) is non-negotiable.

## 9. Not in this repo — transfer checklist

The following exist outside this repository and must be transferred through
private channels (this list contains pointers only, no values):

- [ ] API worker source code (`rootmyandroid-api`) + its Cloudflare
      configuration, secrets, and price-table test
- [ ] Cloudflare account access (Pages project `rootmyandroid`, the worker,
      the `/v1` route, the two GitHub secrets used by the deploy job)
- [ ] Domain registrar / DNS control for rootmyandroid.com
- [ ] Payment-rail provider account + its API credentials/webhook config
- [ ] Simple Analytics site ownership
- [ ] Codecov project + `CODECOV_TOKEN`
- [ ] GitHub repo ownership + the self-hosted runner `blackhost` (or migrate
      CI to GitHub-hosted runners)
- [ ] Android release keystore (`.keystore/release.keystore`, untracked) +
      its passwords; Play Console access if listings exist
- [ ] support@rootmyandroid.com mailbox
- [ ] NanoGPT API key (asset generation, §6.4) or a replacement provider

## 10. Suggested first-week priorities

1. Complete the §9 access transfer and rotate every credential.
2. Run the full pipeline locally: `pnpm install && pnpm check && pnpm test &&
   pnpm build`.
3. Ship Phase 2 (§6.2) — the highest-leverage open item: the landing page
   currently targets no search phrase.
4. Then Phase 3 (§6.3) to supply the Phase-2 illustrations.
5. Decide the deferred items in §6.5.
