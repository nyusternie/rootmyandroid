# AGENTS.md — Root My Android

Guidance for AI agents (and humans) working in this repository.

> **New team?** Read [HANDOFF.md](HANDOFF.md) first for the full system tour
> (architecture, deploy pipeline, roadmap), then come back here for the
> working rules.

## Mission

Restore and modernize rootmyandroid.com as a paid service (~$5/mo, Mullvad-style
account model: no email, account-number-only). The core product uses **ADB** to
scan and analyze a physical Android device and produce a rooting / upgrade plan.
Advanced features will be paywalled; free tier covers basic scanning and docs.

## Repository layout (pnpm workspace)

```
/
├── apps/
│   ├── web/          # Astro 7 static site (zero-JS content pages; vanilla TS
│   │                 # modules on the app pages that call the API at /v1)
│   ├── rooted/       # React Native 0.88 app (com.rootmyandroid.rooted), jest
│   └── guardian/     # React Native 0.88 app (com.rootmyandroid.guardian), jest
├── packages/         # shared workspace packages (created as needed)
├── .github/workflows/web.yml   # Web CI + Cloudflare Pages deploy gate
├── .vendor/          # Vendored tarballs (hermes-compiler; see overrides in
│                     # pnpm-workspace.yaml)
├── pnpm-workspace.yaml
└── package.json      # root scripts only; private, no publish
```

- Package manager: **pnpm 11.x** (see `packageManager` in root package.json).
  Do not commit `node_modules`, `yarn.lock`, or `package-lock.json`.
- Node >= 18.17 required (CI uses Node 22).
- The API Worker (`rootmyandroid-api`, serving `rootmyandroid.com/v1`) is a
  separate codebase — it is NOT in this repository.
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
   (`/account`, `/audit`, `/pay`, `/profile`) that talk to the API Worker at
   `rootmyandroid.com/v1`. Content pages (`/`, `/guides/*`) must ship
   **zero JavaScript**. All dynamic/backend functionality lives in the
   separate `rootmyandroid-api` Cloudflare Worker.
5. **Guides are Astro content collections** (`src/content/guides/*.md`, schema
   in `src/content.config.ts`). Real, device-accurate content only — per the
   no-guessing rule, do not invent device behavior.
6. **Never wipe third-party app data.** Do NOT run `pm clear`, `pm uninstall`,
   or any other data-destroying command on any package other than our own two
   (`com.rootmyandroid.rooted`, `com.rootmyandroid.guardian`). Even for our own
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
  (`public/og-image.png`, 1200×630), `theme-color`, favicons, and
  Organization + WebSite JSON-LD. Page-specific schema lives in the page
  itself (e.g. SoftwareApplication + Offer on `/`).
- Structured data MUST mirror visible page copy — pricing above all. Never
  publish schema (offers, ratings, FAQs) for content that is not on the page,
  and never invent ratings or reviews.
- The landing-page SEO roadmap (Phases 2–3: keyword-targeted rebuild, FAQ +
  FAQPage schema, illustration set) is specified in HANDOFF.md.

## Payments direction (planning)

- Preference: crypto-first, but support fiat methods that auto-convert to
  crypto **without a bank account**. Candidate processors to evaluate:
  BTCPay Server (self-hosted, no KYC), NOWPayments, Coinbase Commerce,
  and fiat on-ramps that settle to crypto. Final selection TBD — do not
  hard-code a provider before one is chosen.
- Mullvad-style accounts: random account number, no personal data, time-based
  credit. Design all billing code around that model.

## Nitro economy (live)

Nitro is the in-account credit unit that PRO features burn. Base rate:
$5 = 100 Nitro, with tiered pack discounts. Three PRO services are gated by
Nitro, priced server-side in the API (owner-approved 2026-10-24):

| Service         | Nitro | Billed on                                                   |
| --------------- | ----- | ----------------------------------------------------------- |
| `cloud_backup`  | 20    | Registering one encrypted backup (5 GB per-account cap)     |
| `guardian_sync` | 10    | Pairing a NEW Guardian device (re-syncs are free)           |
| `audit_report`  | 5     | First save into a (device, audit_type) slot (refresh free)  |

- The API's price table is the single source of truth; `GET /v1/nitro/services`
  publishes the catalog so sites/apps render prices dynamically. Never
  hard-code prices in clients.
- Changing any price requires explicit owner approval; a pinned API test
  locks the table.
- Payment crediting is self-healing: the status-polling endpoint reconciles
  terminal payments server-side, so webhook delivery is not on the critical
  path.

## ADB / device analysis direction (planning)

- The product will communicate with devices via ADB (WebUSB in the browser is
  the likely transport; verify before committing).
- Device scanning, bootloader/unlock detection, and root-method selection are
  the free core; advanced features (automated flashing, backups, fleet
  management) are candidates for the paid tier — still to be defined.
