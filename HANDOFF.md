# HANDOFF.md — Root My Android

**Handoff date:** 2026-10-27
**Audience:** the next session / team taking over this project.
**Companion doc:** [AGENTS.md](AGENTS.md) — the standing working rules. Those
rules still apply unless the owner explicitly changes them.
**This session's mission:** build `/scan` — browser-based physical-device
analysis (§10). Everything before §10 is the system tour you need first.

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

The product's **free core** — device scanning, bootloader/unlock detection,
root-method selection — is the `/scan` page, and it **does not exist yet**.
Building it is the mission in §10. (The existing `/audit` page only scans the
device *viewing the page* via browser signals; it does not talk to a physical
Android device.)

## 2. Live system inventory

| Piece                  | What / where                                                  |
| ---------------------- | ------------------------------------------------------------- |
| Marketing/docs site    | This repo (`apps/web`) → Cloudflare Pages project `rootmyandroid` |
| API                    | `rootmyandroid.com/v1` — Cloudflare Worker `rootmyandroid-api`. **Source is NOT in this repo** (sibling repo, see §9) |
| Payments               | A single hosted crypto payment rail, integrated in the API worker + the whitelabel checkout pages in `apps/web` (`/account`, `/pay`). Provider account is owned out-of-band |
| Analytics (collector)  | First-party, in `rootmyandroid-api`: `POST /v1/analytics/event` (JS beacon, `src/scripts/analytics.ts`) + `GET /v1/analytics/t.gif` (`<noscript>` pixel in `Base.astro`). D1 DB `rootmyandroid-analytics`. Bot UA filtering (counter + top-agents only). No third-party analytics anywhere |
| Analytics (dashboard)  | `rootmyadmin` worker — **separate repo `rootmyandroid-admin`** — at admin.rootmyandroid.com. SIWE sign-in; snapshots endpoint for agents via bearer token (owner-set secret). Direct-DB reader; fail-soft on missing tables |
| Analytics (monitor)    | `.github/workflows/analytics-monitor.yml` in `rootmyandroid-api`: daily cron probes prod `hits` COUNT/MAX(ts), fails the run on empty table or 72 h staleness (fail-closed) |
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
│   │   ├── src/pages/      # /, /account, /audit, /backup-audit, /download,
│   │   │                   # /guides, /nitro, /pay, /privacy, /profile,
│   │   │                   # /refunds, /roms, /terms (+ /scan — §10, new)
│   │   ├── src/scripts/    # Vanilla TS: account.ts, analytics.ts, audit.ts,
│   │   │                   # deposit.ts, payment.ts (the ONLY client JS,
│   │   │                   # app pages only; scan.ts joins them — §10)
│   │   ├── src/lib/        # api.js (API client) + *.test.js (vitest) —
│   │   │                   # /scan's pure logic goes here too (§10)
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

Sibling repos (separate codebases, NOT in this repo; check out
`rootmyandroid-api` and `rootmyandroid-admin` alongside this one):

- `rootmyandroid-api` — the Worker: accounts, Nitro, payments, audits,
  analytics collector, analytics monitor. vitest workers-pool suite.
- `rootmyandroid-admin` — the analytics dashboard Worker (SIWE auth,
  snapshots, goals, world/US choropleths, previous-period deltas). vitest
  workers-pool suite; self-hosted CI runner.

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

Proposed additions for `/scan` (npm registry, verified 2026-10-27 — re-verify
at install time; all MIT): `@yume-chan/adb` 2.6.4,
`@yume-chan/adb-daemon-webusb` 2.3.2, `@yume-chan/adb-credential-web` 2.1.0,
`@types/w3c-web-usb` 1.0.14 (dev). See §10.

## 5. Build, test & deploy pipeline

Single workflow: `.github/workflows/web.yml`.

1. Triggers: push to `master`, PRs targeting `master`. Runs on a
   **self-hosted runner** (label in `.github/workflows/web.yml`). Outside-contributor
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
- The sibling repos have their own CI: `rootmyandroid-api` (GitHub-hosted)
  and `rootmyandroid-admin` (self-hosted `[self-hosted, linux, x64]`), both
  gated on their workers-pool vitest suites.

## 6. Web SEO — current state and roadmap

### 6.1 Phase 1 — SHIPPED (2026-10-25, commits `86471c8` + `133ef8a`)

- `@astrojs/sitemap` → `sitemap-index.xml` + `public/robots.txt` referencing
  it. Keep new indexable pages (including `/scan`) in the sitemap.
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
   3/5 forbids invented device claims — **this section's copy must become
   TRUE once `/scan` ships; write it against the shipped feature set**) →
   ROM catalog teaser linking to `/roms` → guides teaser linking to `/guides`
   → **FAQ (static HTML accordion)** → pricing → existing privacy section
   (retained).
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
  `/account/payment/*`) — they are currently in the sitemap. (`/scan` is a
  real landing target, NOT an app shell — keep it indexable.)
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
- **Analytics verification standard**: after touching the collector, verify
  with a direct D1 read (the `rootmyandroid-api` monitor workflow pattern),
  not just HTTP 204s — a 204 once masked a real collection outage for days
  (2026-10-25/26 incident: Worker "Not found" from a stale CI runner cache
  + a `configPath` mismatch that made Pages-vs-worker config resolution
  differ between local and CI; both are documented in that repo's history).
- **Bot traffic**: search-engine crawlers produce real pageview volume; the
  collector filters known bot UAs into a counter (visible as a "Bots &
  crawlers" card in the dashboard). When traffic looks surprisingly flat,
  check the bots card before concluding organic growth.

## 9. Not in this repo — transfer checklist

The following exist outside this repository and must be transferred through
private channels (this list contains pointers only, no values):

- [ ] API worker source code (`rootmyandroid-api`) + its Cloudflare
      configuration, secrets, and price-table test
- [ ] Admin dashboard source code (`rootmyandroid-admin`) + its SIWE/shared
      secrets; decide and set the agent-snapshot bearer token
- [ ] Cloudflare account access (Pages project `rootmyandroid`, the workers,
      the `/v1` route, the analytics D1, the GitHub secrets used by deploys)
- [ ] Domain registrar / DNS control for rootmyandroid.com (incl.
      admin.rootmyandroid.com)
- [ ] Payment-rail provider account + its API credentials/webhook config
- [ ] Codecov project + `CODECOV_TOKEN`
- [ ] GitHub repo ownership + the self-hosted CI runner (or migrate
      CI to GitHub-hosted runners)
- [ ] Android release keystore (`.keystore/release.keystore`, untracked) +
      its passwords; Play Console access if listings exist
- [ ] support@rootmyandroid.com mailbox
- [ ] NanoGPT API key (asset generation, §6.4) or a replacement provider

## 10. NEXT SESSION MISSION: `/scan` — analyze any physical Android device from the browser

**The mission, in the owner's words:** anyone MUST be able to analyze their
physical device from their web browser. This is the product's free core and
the reason the rest of the site exists. It does not exist yet — `/audit`
only inspects the browsing device. Build `/scan`.

### 10.1 What v1 must do

1. User plugs a physical Android device into a desktop browser via USB,
   opens `rootmyandroid.com/scan`, clicks **Connect**, authorizes the ADB
   RSA prompt on the device, and gets a rendered report — no installs, no
   account, nothing transmitted.
2. The report shows, at minimum: brand/manufacturer/model + device codename,
   Android version + SDK, security-patch level + patch age, build
   fingerprint, bootloader/unlock state **when determinable** (else honestly
   "unknown"), verified-boot state when determinable, root indicators
   (labeled heuristic), and matched next steps (links to verified
   `/guides/*` / `/roms/*` where they exist).
3. Optional **Save to account**: the report JSON is stored via
   `saveAudit(..., auditType: 'scan')` — billed as `audit_report` (5 Nitro,
   first save per (device, audit_type) slot, refresh free), price rendered
   dynamically from `GET /v1/nitro/services`. Never hard-code the price.
4. Every non-happy path renders a clear state: no WebUSB in this browser →
   static explainer (which browsers work); picker cancelled; USB debugging
   off; RSA authorization pending/denied; device disconnected mid-scan.

### 10.2 Verified foundation (do NOT re-litigate; re-verify versions at install)

- **Transport: ADB over WebUSB, 100% client-side.** No API round-trip for
  device traffic — the browser IS the ADB host.
- **Libraries** (npm registry, checked 2026-10-27, all MIT):
  - `@yume-chan/adb` 2.6.4 — TypeScript ADB protocol implementation
    (actively maintained: last publish 2026-10-09).
  - `@yume-chan/adb-daemon-webusb` 2.3.2 — WebUSB daemon transport.
  - `@yume-chan/adb-credential-web` 2.1.0 — ADB auth key storage via
    WebCrypto + IndexedDB.
  - `@types/w3c-web-usb` 1.0.14 — WebUSB TypeScript definitions (dev dep).
- **Bundling pattern proven in this repo**: `src/scripts/deposit.ts`
  imports the npm package `qrcode-generator` and Astro/Vite bundles it into
  the page module — importing `@yume-chan/*` from a new
  `src/scripts/scan.ts` is the same, working path.
- **No API change needed for saving**: audit types are deliberately
  open-ended (`rootmyandroid-api/src/lib/audit.js`: `AUDIT_TYPE_PATTERN =
  /^[a-z][a-z0-9-]{0,31}$/`, comment: "new audit classes ship without an API
  change"). `saveAudit` already exists in `src/lib/api.js`.
- **Fastboot is OUT OF SCOPE for v1.** No `@yume-chan/fastboot` package
  exists on npm (404 verified 2026-10-27). Do not promise flashing anywhere
  in UI or copy.

### 10.3 Architecture (proposed — follow unless a fact here breaks)

- `src/pages/scan.astro` — app page (JS allowed per AGENTS.md rule 4;
  already listed there). Static explainer (what it does, privacy stance,
  browser requirements, how to enable USB debugging) + the interactive
  mount. Keep it indexable (sitemap) — it's a landing target.
- `src/scripts/scan.ts` — the page module: connect/auth/query orchestration
  and DOM rendering. Follow `audit.ts` conventions (strict `$(id)` helper,
  no unsanitized innerHTML, module-side `hidden` panels).
- `src/lib/scan-report.ts` (NEW, pure) — all parsing + detection as pure
  functions: `parseGetprop(text) → Record<string,string>`,
  `analyzeDevice(rawFacts) → ScanReport` (the rules engine). Zero DOM, zero
  ADB imports → unit-testable in vitest (pattern: `src/lib/api.test.js`).
- `src/lib/scan-report.test.js` + `src/lib/fixtures/scan/*.json` —
  fixture-driven tests. **Each fixture is a capture from a real device,
  named `brand-model-androidversion-YYYYMMDD.json`** (e.g. a `getprop` dump
  + `pm list packages` output). Fixtures are the ONLY way CI can prove
  correctness — there is no USB device on the runner.

### 10.4 Data collection (READ-ONLY — verify each against real hardware)

Candidate facts to collect via ADB shell (read-only only; AGENTS.md rule 6
applies; never write/flash/`su`):

- `getprop` (parse `KEY: [VALUE]` lines): `ro.product.brand`,
  `ro.product.manufacturer`, `ro.product.model`, `ro.product.device`
  (codename), `ro.build.fingerprint`, `ro.build.version.release`,
  `ro.build.version.sdk`, `ro.build.version.security_patch`,
  `ro.build.tags`, `ro.product.cpu.abi`, `ro.hardware`.
- Unlock/bootloader indicators: `ro.boot.flash.locked`,
  `ro.boot.verifiedbootstate`, `ro.boot.vbmeta.device_state`,
  `sys.oem_unlock_allowed`. **Availability varies by OEM and Android
  version — an absent key is "unknown", never an assumption** (rule 3).
  Each rule in the engine carries a comment: which device + date verified it.
- Root indicators (heuristic, labeled as such in the UI): `command -v su`,
  known root-app package IDs from `pm list packages` (e.g.
  `com.topjohnwu.magisk`). Never attempt to run `su`.
- Recommendations: map (codename, brand, unlock state, patch age) →
  `{unlock_state, findings[], next_steps[]}` where next steps link only to
  content that exists (`/guides/*`, `/roms/*`). No invented device claims.

### 10.5 UX states (all must exist)

1. `navigator.usb` missing → static fallback panel (supported browsers list
   — **verify the current WebUSB support matrix from MDN/caniuse during
   implementation and cite the source in a comment**; Chrome/Edge desktop is
   the expected target).
2. Idle → Connect button (device picker with ADB interface filter; verify
   the interface class/subclass/protocol filter values against the spec +
   real devices, don't guess).
3. Awaiting device authorization (RSA prompt instructions, exact steps for
   enabling Developer options + USB debugging, with screenshots deferred to
   Phase-3 asset workflow if needed).
4. Scanning (progress list of facts as they resolve).
5. Report rendered + Save-to-account panel (account-number input, Nitro
   price from `/v1/nitro/services`, insufficient-balance path reusing the
   existing checkout flows).
6. Errors: picker cancelled, unauthorized/denied, disconnected mid-scan,
   unsupported device interface — each with a retry path.

### 10.6 Privacy & analytics wiring

- Default: zero transmission. The first network call happens only on
  explicit **Save to account** (`saveAudit`) — state this on the page, and
  update `/privacy` in the same PR (collection semantics changed).
- Instrument with the existing beacon (AGENTS.md "Analytics"): suggested
  events `scan_connect`, `scan_authorized`, `scan_complete`,
  `scan_save_clicked` via `data-rma-event` / `window.rmaEvent(...)`. These
  land in the admin dashboard; create matching goals there (owner action).

### 10.7 Definition of done (v1)

- `pnpm check`, `pnpm test`, `pnpm build` green (rule 1); new pure logic
  covered by fixture tests.
- `/scan` live on Pages; all §10.5 states reachable; report matches §10.1
  on at least one real device per available OEM, with the verification
  matrix (device + date + result) documented in the PR.
- Save-to-account works end-to-end with a real account (5 Nitro charged on
  first save, refresh free — verify against the API's pinned price table).
- `/privacy`, sitemap, and landing "what the scan detects" copy updated in
  the same PR to match the SHIPPED behavior.
- No changes required in `rootmyandroid-api` or `rootmyandroid-admin`
  (verified — audit types are open-ended). If implementation proves
  otherwise, that's a finding: stop and report.

### 10.8 Honest unknowns (resolve with sources, never guesses — rule 3)

- Exact WebUSB browser-support matrix at ship time (MDN/caniuse).
- Per-OEM availability of the unlock-state getprop keys (fixtures decide).
- ADB RSA auth UX differences across Android versions (12/13/14/15).
- Bundle-size impact of the `@yume-chan/*` packages on `/scan` (measure;
  the module is page-scoped so other pages are unaffected).
- Whether any target devices need non-default WebUSB interface filters.

## 11. Other open items (after /scan)

1. **Owner actions pending** (2 minutes each): set the agent-snapshot
   bearer token secret in `rootmyandroid-admin` (`wrangler secret put`); create
   the first analytics goals (`/guides/*`, `/download`, `payment_completed`,
   plus the `scan_*` events once shipped).
2. SEO Phase 2 (§6.2) then Phase 3 (§6.3) — the traffic engine; note 6.2's
   "what the scan detects" copy depends on the shipped `/scan`.
3. Analytics snapshot materialization (cron + storage table) — only if
   snapshot polling ever gets slow on a large `hits` table; compute-on-read
   is fine at current volume.
4. Deferred by owner: CSV exports. Excluded on principle: heatmaps/session
   replay (privacy-incompatible).
