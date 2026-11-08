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
Pro $15, covering up to 5 devices per account) and **Rootz Pro**
(professional tools — Terminal Editor, Log Analysis — $15 per 365 days).
Top-ups are prepaid (Mullvad-style): add time anytime, no auto-renewal.

## Repository layout (pnpm workspace)

```
/
├── apps/
│   ├── web/          # Astro 7 static site (zero-JS content pages; vanilla TS
│   │                 # modules on the app pages that call the API at /v1)
│   ├── android/      # Root My Android (Android edition): RN 0.88 app
│   │                 # (com.rootmyandroid), jest
│   ├── ios/          # RootMyAndroid (iOS monitoring edition): RN 0.88 app
│   │                 # (bundle id com.rootmyandroid; android/ is a
│   │                 #  preview-only shell, com.rootmyandroid.preview), jest
│   ├── guardian/     # React Native 0.88 app (com.rootmyandroid.guardianangel), jest
│   └── rootz/        # Rootz daemon: Rust, rooted Android devices (scaffold; daemon team owns v1)
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
7. **Web styling is 100% Tailwind.** `apps/web` styles exclusively through
   Tailwind v4 (Vite plugin in `astro.config.mjs`, entry
   `src/styles/global.css`): markup uses **utilities**; shared design-system
   classes (`.panel`, `.btn`, `.row`, `.hero`, …) are composed with `@apply`
   inside global.css's `@layer base/components`; the `@theme` block is the
   single source of truth for tokens (colors are `--color-*` — `text-ok`,
   `border-line`, `bg-raise`… — fonts, and `--animate-*` keyframes). **Never**
   use inline `style=""` attributes, **never** add `<style>` blocks (scoped or
   global) to `.astro` files, and never introduce another styling system
   (CSS modules, styled-components, plain `.css` files besides global.css).
   Breakpoints are responsive variants (`min-[720px]:grid-cols-2`, …);
   pseudo-elements/states are variants (`before:content-['✓_']`, `hover:`).
   ONE sanctioned exception: **dynamic runtime-computed values** (an SVG
   gauge's `stroke-dasharray` set from TS, a frontmatter-derived max-width)
   may be carried via a CSS custom property set in `style={…}` and consumed
   by an arbitrary-value utility (`max-w-(--profile-img-w)`); client scripts
   may also write `.style.*` at runtime. Everything static is utilities-only.
   (Rule added 2026-11-08 after the owner mandated Tailwind for ALL styling
   and the whole web app was converted: inline styles and scoped `<style>`
   blocks were removed from every page and layout.)
8. **Dependencies are pinned — always.** Every dependency specifier in every
   workspace `package.json` must be EXACT (`4.3.3`, not `^4.3.3` / `~4.3.3` /
   `*` / `latest`); `workspace:*` / `file:` protocols are allowed (inherently
   exact). `.npmrc` carries `save-exact=true` so `pnpm add` writes exact
   versions; `tools/check-pinned-versions.mjs` runs in `pnpm check` (CI gate)
   and fails on any ranged specifier. Pin to the version actually resolved
   in `pnpm-lock.yaml`, then run `pnpm install` to sync the lockfile.
   (Rule added 2026-11-08: owner mandate — no package may be installable
   un-pinned.)

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
- **Colonel Su** (white beard, round glasses, charcoal monk robe, staff
  bearing the SU emblem) — the Rootz Pro professional-tools product
  ("Colonel" = kernel, "Su" = superuser — a play on "kernel root"; name
  ruled FINAL 2026-11-08, after the 2026-11-07 interim "Colonel Rewt").
  "Guru" now belongs to the AI-assistant product surface (the Gurus —
  docs/HANDOFF-2026-11-08-gurus-page.md), never to this mascot.

Hard rules: Android green `#3DDC84`; no root/plant motifs; icons must show
the FULL body (head-only crops banned); any typography is rendered by the
image LLM itself, never composited in post (no PIL text).

## Payments direction (live + planning)

- Crypto payments are LIVE (the Buy panel on `/account` issues real
  invoices); crypto gets 15% off the listed prices (owner ruling 2026-11-05,
  narrowed 2026-11-08: subscription plans ONLY — never Guru Balance or
  AI-usage top-ups); enforced server-side in `rootmyandroid-api`. Credit
  card checkout is mocked in the UI and activates once the merchant account
  is approved.
- Preference: crypto-first, but support fiat methods that auto-convert to
  crypto **without a bank account**. Candidate processors to evaluate:
  BTCPay Server (self-hosted, no KYC), NOWPayments, Coinbase Commerce,
  and fiat on-ramps that settle to crypto. Final selection TBD — do not
  hard-code a provider before one is chosen.
- Mullvad-style accounts: random account number, no personal data, time-based
  credit. Design all billing code around that model.

## Plans + pricing economy (owner-ruled 2026-11-05)

The Halo credit unit is DISCONTINUED — retired 2026-11-05 and fully purged
from this repo 2026-11-08 (owner ruling: no Halo references anywhere —
copy, code, class names, or asset filenames). Pricing is plain dollar
top-up subscriptions (Mullvad-style: add time anytime, no auto-renewal,
no stored card). The authoritative price table (also live on `/pricing`):

| product        | plan | price | period    |
| -------------- | ---- | ----- | --------- |
| — (free core)  | Free | $0    | —         |
| Guardian Angel | Lite | $5    | 30 days   |
| Guardian Angel | Pro  | $15   | 30 days   |
| Rootz          | Pro  | $15   | 365 days  |

- Guardian Angel Lite ↔ Pro: subscribers may switch plans anytime (Rootz
  Pro is a separate lane — no switching). Lite = `read_apps` +
  `read_messages`; Pro absorbs the remaining monitoring features; the exact
  feature packaging is still being finalized (owner: to be sorted out later).
- Crypto payments get 15% off listed prices (owner ruling 2026-11-05;
  narrowed 2026-11-08: subscription plans ONLY — never Guru Balance or
  AI-usage top-ups, and no discount badges on Guru Balance UI);
  enforcement is server-side in `rootmyandroid-api` — do NOT hard-code
  discounted amounts in clients.
- Each account links up to 5 devices (Mullvad parity, owner ruling
  2026-11-05) via `POST /v1/guardian-angel/sync` (API team, 2026-11-05); a
  device-swap cooldown (~72h) is PROPOSED, not ruled — do not state an exact
  cooldown in user-facing copy until the owner rules it.
- Changing any price requires explicit owner approval; a pinned API test
  locks the table.
- The AI-usage balance is `guruBalance` ("Guru Balance") — pay-per-use
  with a published per-request price before each request, a running
  balance, and an itemized receipt. Guru Balance top-ups are
  NON-refundable, and the 15% crypto discount NEVER applies to them
  (owner rulings 2026-11-08). The Guru Balance contract is owned by
  `rootmyandroid-api` — do NOT invent it client-side
  (docs/HANDOFF-2026-11-08-gurus-page.md).
- The subscription-plan catalog is live via the MCP
  `list_subscription_plans` tool and its REST equivalent (verified
  2026-11-07 — see `apps/web/src/pages/agents.astro`). Never hard-code
  prices in clients; do NOT invent catalog contracts client-side.
- The old per-service burn model (`cloud_backup` / `guardian_angel_sync` /
  `audit_report` consumes) is RETIRED and its client surface was removed
  with the 2026-11-08 purge (HANDOFF.md §10). Do NOT present services as
  purchasable line items in new UI.
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
  `audit_report` service slug, price rendered dynamically).
- No guessing device behavior (rule 3): every detection rule cites its
  source (observed device + date) and unknown values render as "unknown".
- Detection/parsing logic lives in pure, fixture-tested functions under
  `src/lib/` — CI has no physical device, so correctness is proven with
  fixtures captured from real devices (each fixture named with model +
  capture date).
- Device scanning, bootloader/unlock detection, and root-method selection are
  the free core; advanced features (automated flashing, backups, fleet
  management) are candidates for the paid tier — still to be defined.
