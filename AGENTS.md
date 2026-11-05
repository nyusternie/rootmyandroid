# AGENTS.md — Root My Android

Guidance for AI agents (and humans) working in this repository.

> [HANDOFF.md](HANDOFF.md) is the historical decision log (the Nitro→Halo
> rebrand and the pricing history through 2026-11-05). The working rules
> below — including the current price table — are the present-day
> authority.

## Mission

Restore and modernize rootmyandroid.com as a paid service (Mullvad-style
account model: no email, account-number-only). The core product uses **ADB** to
scan and analyze a physical Android device and produce a rooting / upgrade plan
— that scan core is FREE (no account). Two paid products (owner ruling
2026-11-05): **Guardian Angel** (monthly monitoring top-ups — Lite $5,
Pro $15, covering up to 5 devices per account) and **Rooted Pro**
(professional tools — Terminal Editor, Log Analysis — $15 per 365 days).
Top-ups are prepaid (Mullvad-style): add time anytime, no auto-renewal.

## Repository layout (pnpm workspace)

```
/
├── apps/
│   ├── web/          # Astro 7 static site (zero-JS content pages; vanilla TS
│   │                 # modules on the app pages that call the API at /v1)
│   ├── android/      # Rooted (Android utility): RN 0.88 app
│   │                 # (com.rootmyandroid), jest
│   ├── ios/          # RootMyAndroid (iOS monitoring edition): RN 0.88 app
│   │                 # (bundle id com.rootmyandroid; android/ is a
│   │                 #  preview-only shell, com.rootmyandroid.preview), jest
│   └── guardian/     # React Native 0.88 app (com.rootmyandroid.guardianangel), jest
├── packages/
│   └── shared/       # rootmyandroid-shared — theme + typed /v1 API client
│                     # shared by the mobile apps (TS source, no build step)
├── .github/workflows/web.yml   # Web CI + Cloudflare Pages deploy gate
├── .agents/skills/   # Project agent skills (brand-image: brand canon)
├── .vendor/          # Vendored tarballs (hermes-compiler; see overrides in
│                     # pnpm-workspace.yaml)
├── pnpm-workspace.yaml
└── package.json      # root scripts only; private, no publish
```

- Package manager: **pnpm 11.x** (see `packageManager` in root package.json).
  Do not commit `node_modules`, `yarn.lock`, or `package-lock.json`.
- Node >= 18.17 required (CI uses Node 22).
- The API Worker (`rootmyandroid-api`, serving `rootmyandroid.com/v1`) is a
  separate codebase — it is NOT in this repository. Neither is
  `rootmyandroid-admin` (the analytics dashboard at admin.rootmyandroid.com).
  Both live in sibling repos; keep their contracts in sync deliberately
  (beacon wire contract in `src/scripts/analytics.ts`, `src/lib/api.js`).
- `nodeLinker: hoisted` is set in `pnpm-workspace.yaml` because React Native
  tooling cannot traverse pnpm's symlinked layout. Do not remove it.

## Commands

| Task            | Command                    |
| --------------- | -------------------------- |
| Install         | `pnpm install`             |
| Dev server      | `pnpm dev`                 |
| Type-check      | `pnpm check`               |
| Test (all pkgs) | `pnpm test`                |
| Build (static)  | `pnpm build`               |

CI mirrors these exactly: every push to `master` runs check → test:coverage →
build, and only then deploys `apps/web/dist` to Cloudflare Pages (see
`.github/workflows/web.yml`).

## Hard rules for agents

1. **Tests gate deploys.** `pnpm test` and `pnpm build` must both pass before
   anything is deployed to Cloudflare. Never deploy with failing or skipped
   tests, and never delete a test just to make CI green.
2. **Minimum diff.** Preserve existing logic, comments, debug sections, and
   blank-line structure. 1:1 logic parity unless a change is explicitly asked
   for. Treat every file as production-critical.
3. **No guessing.** If a fact (device behavior, ADB command semantics, payment
   provider capability) cannot be verified from the repo or an authoritative
   source, say so explicitly and ask — do not invent it.
3a. **Public repo — private matters stay out of the record.** This repository
   (commits, messages, code comments, issues, CI logs) is PUBLIC. Never put
   billing internals, payment-provider account details, business/entity
   formation details (LLC registration, agents, addresses), account numbers,
   wallet addresses, or any other private business matter into git history or
   committed files. Commit messages describe code changes only. Discuss those
   topics in chat, not in the repo.
4. **Static export.** `apps/web` is a purely static **Astro** site
   (`astro build` → `dist/`). No SSR, no Astro server adapters. Client-side
   JavaScript is limited to the vanilla TS modules on the app pages
   (`/account`, `/audit`, `/pay`, `/profile`, and `/scan` once it ships)
   that talk to the API Worker at `rootmyandroid.com/v1`. Content pages
   (`/`, `/guides/*`) must ship
   **zero JavaScript**. All dynamic/backend functionality lives in the
   separate `rootmyandroid-api` Cloudflare Worker.
5. **Guides are Astro content collections** (`src/content/guides/*.md`, schema
   in `src/content.config.ts`). Real, device-accurate content only — per the
   no-guessing rule, do not invent device behavior.
6. **Never wipe third-party app data.** Do NOT run `pm clear`, `pm uninstall`,
   or any other data-destroying command on any package other than our own two
   (`com.rootmyandroid`, `com.rootmyandroid.preview`,
   `com.rootmyandroid.guardianangel`). Even for our own
   packages — and ALWAYS for anything system-level such as the launcher
   (`com.google.android.apps.nexuslauncher`) — a wipe requires a separate,
   explicit, same-turn user confirmation whose prompt names the exact
   consequence (e.g. "this erases your entire home-screen layout"). (Rule added
   2026-10-19 after a launcher `pm clear` destroyed the user's home-screen
   layout; restored from Google backup via `bmgr restore`.)

## Web SEO (live)

- `public/robots.txt` and the auto-generated sitemap (`@astrojs/sitemap`, see
  `astro.config.mjs`) ship from `apps/web`. Keep every indexable page in the
  sitemap; keep app-shell-only pages out of search if that is ever decided
  (`noindex`, not `robots.txt` disallow).
- `src/layouts/Base.astro` owns sitewide meta: OG/Twitter cards
  (`public/og-image.png`, 1200×630 — overridable per page via `og*` props),
  `theme-color`, favicons, and Organization + WebSite JSON-LD.
  Page-specific schema lives in the page itself (e.g.
  SoftwareApplication + Offer on `/`).
- SEO profile pages: ten third-party product/service profiles
  (`/GrapheneOS`, `/Magisk`, `/TWRP`, `/Shizuku`, `/AOSP`, `/ADB`,
  `/KernelSU`, `/APatch`, `/LineageOS`, `/Dhizuku`) share
  `src/layouts/Profile.astro` (layered on Base.astro): per-page
  title/description/canonical, per-page OG art (SVG art falls back to the
  sitewide card), optional page JSON-LD via the `schema` prop. Brand-cased
  paths are canonical; case variants 301 via `public/_redirects` (never add
  bidirectional rules — they loop). Art lives in `public/img/topics/`:
  licensed Commons images with attribution, or self-generated CC0 (source
  art committed to `apps/web/tools/assets/`).
- Structured data MUST mirror visible page copy — pricing above all. Never
  publish schema (offers, ratings, FAQs) for content that is not on the page,
  and never invent ratings or reviews.
- The landing-page SEO roadmap (Phases 2–3: keyword-targeted rebuild, FAQ +
  FAQPage schema, illustration set) is specified in HANDOFF.md.

## Brand identity (live)

Three Android-green characters — palette, prompts, and the ship procedure
live in `.agents/skills/brand-image/` (read it before ANY image task):

- **SU superhero** (red cape, yellow SU diamond shield) — the Root My
  Android default: OG card, landing hero, favicons.
- **Guardian Angel** (golden halo, no cape) — the monitoring product;
  wardrobe studies under `/img/brand/` await the owner's pick.
- **Guru Daemon** (white beard, round glasses, charcoal monk robe, staff
  bearing the SU emblem) — the Rooted Pro professional-tools product.

Hard rules: Android green `#3DDC84`; no root/plant motifs; icons must show
the FULL body (head-only crops banned); any typography is rendered by the
image LLM itself, never composited in post (no PIL text).

## Payments direction (live + planning)

- Crypto payments are LIVE (the Buy panel on `/account` issues real
  invoices); crypto gets 15% off the listed prices (owner ruling 2026-11-05,
  enforced server-side in `rootmyandroid-api`). Credit card checkout is
  mocked in the UI and activates once the merchant account is approved.
- Preference: crypto-first, but support fiat methods that auto-convert to
  crypto **without a bank account**. Candidate processors to evaluate:
  BTCPay Server (self-hosted, no KYC), NOWPayments, Coinbase Commerce,
  and fiat on-ramps that settle to crypto. Final selection TBD — do not
  hard-code a provider before one is chosen.
- Mullvad-style accounts: random account number, no personal data, time-based
  credit. Design all billing code around that model.

## Plans + pricing economy (owner-ruled 2026-11-05)

The Halo credit unit is being RETIRED: pricing is now plain dollar top-up
subscriptions (Mullvad-style: add time anytime, no auto-renewal, no stored
card). The authoritative price table (also live on `/pricing`):

| product        | plan | price | period    |
| -------------- | ---- | ----- | --------- |
| — (free core)  | Free | $0    | —         |
| Guardian Angel | Lite | $5    | 30 days   |
| Guardian Angel | Pro  | $15   | 30 days   |
| Rooted         | Pro  | $15   | 365 days  |

- Guardian Angel Lite ↔ Pro: subscribers may switch plans anytime (Rooted
  Pro is a separate lane — no switching). Lite = `read_apps` +
  `read_messages`; Pro absorbs the remaining monitoring features; the exact
  feature packaging is still being finalized (owner: to be sorted out later).
- Crypto payments get 15% off listed prices (owner ruling 2026-11-05);
  enforcement is server-side in `rootmyandroid-api` — do NOT hard-code
  discounted amounts in clients.
- Each account links up to 5 devices (Mullvad parity, owner ruling
  2026-11-05) via `POST /v1/guardian-angel/sync` (API team, 2026-11-05); a
  device-swap cooldown (~72h) is PROPOSED, not ruled — do not state an exact
  cooldown in user-facing copy until the owner rules it.
- Changing any price requires explicit owner approval; a pinned API test
  locks the table.
- Legacy Halo interim state: packs `halo_1` / `halo_4` / `halo_6`
  ($5 = 1 Halo) are still purchasable via the `/account` Buy panel and
  convert to subscription time on the backend when the plan system lands;
  redeem codes will be redenominated to plan time (backend work, owned by
  the API team). `/halo` and `/nitro` 301 to `/pricing`.
- The API's plan-catalog endpoint is being built by the API team
  (`rootmyandroid-api`); until it ships, `GET /v1/halo/services` (frozen
  zero prices) remains the only live catalog endpoint. Never hard-code
  prices in clients; do NOT invent the new contract client-side.
- The old per-service burn model (`cloud_backup` / `guardian_angel_sync` /
  `audit_report` consumes) is being RETIRED: services are repriced to 0
  ("included/free while plans are finalized"), and the consume path +
  services catalog go away when plan redemption lands (HANDOFF.md §10).
  Do NOT present services as purchasable line items in new UI.
- Payment crediting is self-healing: the status-polling endpoint reconciles
  terminal payments server-side, so webhook delivery is not on the critical
  path.

## Analytics (live, first-party)

- The site runs OUR analytics, not a third party: `src/scripts/analytics.ts`
  (JS beacon on app pages) + a `<noscript>` pixel in `Base.astro`, both
  posting to `/v1/analytics/*` on the same origin (collector lives in
  `rootmyandroid-api`). Do NOT re-introduce third-party analytics.
- The wire contract (short field names, `pv`/`dur`/`ev` types) is documented
  at the top of `src/scripts/analytics.ts` — change it only together with
  the API collector.
- The dashboard is `rootmyandroid-admin` at admin.rootmyandroid.com (SIWE
  sign-in; daily/weekly/monthly snapshots also readable by trusted agents
  via bearer token). A scheduled monitor in `rootmyandroid-api`
  (`.github/workflows/analytics-monitor.yml`) alarms if collection stalls.
- Instrument new app pages with the existing patterns only
  (`window.rmaEvent('name', {detail})`, `data-rma-event` attributes);
  downloads/outbound links are auto-tracked.

## ADB / device analysis direction (ACTIVE — the /scan mission)

`/scan` is the product's free core: anyone with a physical Android device +
USB cable + a WebUSB-capable desktop browser analyzes their device entirely
in the browser — no installs, no account needed for the scan itself. The
binding rules are:

- Transport: ADB over WebUSB, client-side only. Verified libraries (npm
  registry, checked 2026-10-27): `@yume-chan/adb` 2.6.4,
  `@yume-chan/adb-daemon-webusb` 2.3.2, `@yume-chan/adb-credential-web`
  2.1.0, `@types/w3c-web-usb` 1.0.14 — all MIT. Importing them from
  `src/scripts/scan.ts` follows the proven `qrcode-generator` pattern in
  `src/scripts/deposit.ts` (Astro/Vite bundles npm deps for page modules).
  No fastboot-over-WebUSB npm package is verified to exist — flashing is
  OUT OF SCOPE for /scan v1; do not promise it anywhere.
- READ-ONLY on the device. `getprop` + inspection shell commands only. Never
  write, never flash, never request `su`, and rule 6 (no data wipes) applies
  unconditionally.
- Privacy: nothing leaves the browser until the user explicitly saves the
  report to an account number (`saveAudit`, audit_type slug e.g. `scan` —
  the API's audit types are deliberately open-ended, pattern
  `^[a-z][a-z0-9-]{0,31}$`, so NO API change is needed; billed as
  `audit_report` per the legacy service table, price rendered dynamically).
- No guessing device behavior (rule 3): every detection rule cites its
  source (observed device + date) and unknown values render as "unknown".
- Detection/parsing logic lives in pure, fixture-tested functions under
  `src/lib/` — CI has no physical device, so correctness is proven with
  fixtures captured from real devices (each fixture named with model +
  capture date).
- Device scanning, bootloader/unlock detection, and root-method selection are
  the free core; advanced features (automated flashing, backups, fleet
  management) are candidates for the paid tier — still to be defined.
