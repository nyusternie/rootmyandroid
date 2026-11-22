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
│   ├── guardian-angel/ # React Native 0.88 app (com.rootmyandroid.guardian_angel), jest
│   ├── rootz/        # Rootz app (from scratch, com.rootmyandroid.rootz): plain Gradle
│   │                 # Kotlin — wireless-ADB pairing + shell client (complete 2026-11-09,
│   │                 # measured on blueline); rootzd bridge client for su tiers; the APK
│   │                 # is ALSO the relay DAEMON on non-rooted phones (owner ruling
│   │                 # 2026-11-11 — RelayDaemon.kt: pair → challenge → tunnel auth → E2E
│   │                 # sessions over wireless ADB, uid 2000); CI: rootz.yml
│   ├── rootzd/       # Rootz daemon: Rust, rooted Android devices — relay
│   │                 # tunnel + E2E verified live on redfin 2026-11-10
│   └── desktop/      # Root My Android Desktop — final relay CLIENT (owner
│                     # ruling 2026-11-11): Tauri v2 + Tailwind; SCAFFOLD
│                     # ONLY (see its README), not wired into CI yet
├── packages/
│   └── shared/       # rootmyandroid-shared — theme + typed /v1 API client
│                     # shared by the mobile apps (TS source, no build step)
├── .github/workflows/    # web.yml (web CI + Pages deploy gate),
│                       # android-preview.yml, rootz.yml, rootzd.yml (manual
│                       # build dispatch; rootzd cargo tests also auto-run on
│                       # master pushes touching the crate)
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
   separate `rootmyandroid-api` Cloudflare Worker. The landing page `/` is a
   sanctioned exception: it ships the support widget (owner request
   2026-11-04) and the Keep Android Open banner's dismissal-persistence
   inline script (owner ruling 2026-11-08 — once dismissed, the banner must
   not reappear on later page loads, which static HTML + CSS alone cannot
   do; the banner therefore renders ONLY on the JS-shipping pages — /,
   /account, /audit, /pay, /scan — via Base.astro's `banner` prop).
5. **Guides are Astro content collections** (`src/content/guides/*.md`, schema
   in `src/content.config.ts`). Real, device-accurate content only — per the
   no-guessing rule, do not invent device behavior.
6. **Never wipe third-party app data.** Do NOT run `pm clear`, `pm uninstall`,
   or any other data-destroying command on any package other than our own
   (`com.rootmyandroid`, `com.rootmyandroid.preview`,
   `com.rootmyandroid.guardian_angel`, `com.rootmyandroid.rootz`). Even for
   our own
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
9. **Sibling repos are READ-ONLY — handoff docs are the only write
   channel.** `rootmyandroid-api`, `rootmyadmin`, `rootmyandroid-relay`,
   and every other sibling repo are other workstreams' codebases. In them
   the agent may ONLY read files/docs (to keep contracts in sync) and run
   read-only verification commands (test suites, status queries). It must
   NEVER: edit their files, commit or push to them, run their builds or
   deploys (`wrangler deploy`, `gradle`, `astro build`, …), provision
   secrets, or execute any other state-changing operational command —
   not even when it possesses working credentials for their
   infrastructure (credential possession confers NO authority), and not
   even when their commits carry the agent's own authorship from an
   earlier engagement. Requests to the owning team are written as handoff
   docs in THIS repo's `docs/` only. Stated explicitly per owner ruling
   2026-11-10: the agent MAY **write** handoff docs (here, in this repo);
   it may NEVER **commit** (or push) ANYTHING — code, docs, or comments —
   to a sibling repo. Only a direct, explicit, same-task
   instruction from the owner can suspend this rule.
   (Rule added 2026-11-10 after the agent prepared — and repeatedly
   offered — to deploy the `client-relay` worker itself; owner ruling:
   the relay is NOT this agent's lane.)
10. **Date-based versioning, universal.** Every version label in this
   monorepo uses `YY.M.D` (e.g. `v26.11.10`), bumped at each release;
   Android `versionCode` integers keep incrementing independently. (Ruled
   2026-11-09 for Rootz/rootzd — HANDOFF.md; extended monorepo-wide
   2026-11-10.)
11. **Operational credentials live ONLY on blackhost.** Never store API
   tokens, Cloudflare/R2 credentials, infrastructure SSH keys, or any
   other operational secret on the interactive workstation (no env files,
   no dotfiles, no shell rc) — blackhost is the single credential store;
   reach secrets there, use them there, leave them there. Complements
   rule 9 (possession confers no authority) and rule 3a (secrets never
   enter git history). (Owner ruling 2026-11-10: "I DO NOT WANT ANY
   CREDENTIALS STORED HERE — EVERYTHING SHOULD STAY ON blackhost"; first
   application: docs/HANDOFF-2026-11-10-bootimg-agent-token-storage.md.)
12. **Every command timeout ≤ 60 s; poll in tight bursts; never block on
   long waits; check whether a thing already completed before re-running
   it.** Sustained transfers through this host are broken (docs/HANDOFF.md
   §0) — do not retry them; use the healthy legs (blackhost, the phone's
   own HTTPS). (Owner ruling 2026-11-15/16, re-enforced 2026-11-16.)

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

## Web i18n (live)

- Astro native i18n (`astro:i18n` in `astro.config.mjs`): `defaultLocale: 'en'` (unprefixed URLs — existing SEO equity untouched), `locales: ['en', 'zh', 'ru', 'ko']`, `prefixDefaultLocale: false`. Translated pages live under `/zh`, `/ru`, `/ko`. **No `fallback` is configured** — an untranslated page must never emit a locale URL.
- `apps/web/src/i18n/i18n.ts` is the single source of truth: `LOCALES`, `LOCALE_NAMES`, `OG_LOCALES`, `LOCALIZED_ROUTES` (explicit allowlist of default-locale paths whose translations are fully shipped), and the `DICTS` registry. Helpers: `localeOf()`, `dictFor()`, `defaultPath()`, `lp(locale, path)` (locale-aware href builder — falls back to the default-locale URL for unlocalized routes), `alternateLinks()` (drives Base.astro hreflang + `og:locale:*` meta).
- Per-page pattern (repeat exactly when localizing a page): (1) English dictionary `src/i18n/en/<section>.ts` is the typed contract; (2) markup extracted to `src/components/pages/<Page>.astro`, copy via `d.<section>.*`, internal hrefs via `lp(locale, '/path')`, JSON-LD built from the SAME dictionary arrays that render the visible markup (no copy/schema drift); (3) four thin route wrappers (`src/pages/<page>.astro` + `src/pages/{zh,ru,ko}/<page>.astro`); (4) translated dictionaries `src/i18n/{zh,ru,ko}/<section>.ts` typed `typeof en` (CI type-check enforces key parity); (5) register imports + `DICTS` entry + `LOCALIZED_ROUTES` in `i18n.ts`; (6) `pnpm build` and diff the English output against the pre-i18n page — only hreflang links, `og:locale` meta, and the language switcher may change.
- Glossary: product/plan names (Root My Android, Guardian Angel, Rootz, Guardian Angel FREE/LITE/PRO, Colonel Su), third-party names, status labels (LIVE/LABS/PLANNED), commands/paths, and ALL prices are never translated; descriptive copy is.
- Chrome: header (drop-down) + footer (drop-up) get a language switcher — `src/components/LangSwitcher.astro`, a zero-JS `<details>`/`<summary>` dropdown with flag emoji (`LOCALE_FLAGS` in `i18n.ts`) + own-language locale names, `aria-current` + ✓ on the current locale — linking only to existing translations, and Base.astro emits `hreflang` (incl. `x-default`) + per-locale `og:locale` for every `LOCALIZED_ROUTES` page. Content-page zero-JS rule (hard rule 4) is preserved — the switcher is markup only.
- Analytics: the beacon carries Astro's `data-astro-rerun` attributes as before; locale is derivable from the page URL path (`/zh/…`). Do NOT add locale fields to the wire contract without the API team.
- Currently localized: `/`, `/pricing`, `/guardian-angel`, `/rootz`, `/download`. Next candidates: `/why`, `/rooting`, `/parents`, `/gurus`, `/agents`; guides are a content collection and need a separate MD-per-locale strategy. (Added 2026-11-10.)

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

## Android app (live) — QR scanner + F-Droid

`apps/android` (`com.rootmyandroid`, RN 0.88) — the phone app. CI:
`.github/workflows/android.yml` — two flavors since 2026-11-15 (`fdroid`
and `appstore`); release APKs land as assets on tag `android-apk`.

- **QR scanner VERIFIED on redfin (Pixel 5, 2026-11-16), fdroid build
  0ddbe5e:** the manual TextureView surface hand-off (commit 5389c36)
  ends the CameraX 5000 ms session-configure stall inside the RN Modal —
  logcat tag `QrScanView`: `surface texture available` → `camera bound
  (back, preview+analysis, manual surface)` → `preview surface delivered
  1600x1200` → `frames=N` ticking ~15 fps, zero stalls. Live decode ×2:
  a real pairing URL (account digits redacted per rule 3a) and a
  synthetic test QR (`https://rootmyandroid.com/qr-test`). PGM
  forensics: the analyzer dumps the latest ANALYZED luminance array to
  `/sdcard/Android/data/com.rootmyandroid/files/qr-frame.pgm` every ~300
  frames (~20 s); the pulled frame (480x640) decodes host-side (PIL +
  zxing-cpp) to the same real pairing URL — the camera→analysis-buffer
  →ZXing pipeline is proven at pixel level. Fallback preserved: the 6 s
  watchdog still rebinds analysis-only if the texture never arrives
  (decode survives, preview stays black). Test-QR discipline: black-on-
  white PNG only (`qrcode` lib) — terminal ASCII QR renders INVERTED on
  dark terminals and the Java ZXing port cannot decode it.
- **F-Droid Phase 2 COMPLETE (2026-11-16, commits 179791d + 9ed4c0c +
  94b38da):** byte-reproducibility proven on blackhost. (1) Conditional
  release-signing — a props-less clean checkout now yields
  `app-fdroid-release-unsigned.apk` instead of a config crash. (2) Base
  `gradle.properties` is COMMITTED (apps/android/android/gradle.properties):
  without it AGP's built-in Kotlin registers the `kotlin` extension and the
  standalone kotlin.android plugin fails evaluation ("Cannot add extension
  with name 'kotlin'") — the F-Droid from-source build would have crashed;
  caught by the two-path build. Secrets still append via CI only. (3)
  Reproducibility flags: `-ffile-prefix-map` (android root, repo root,
  gradle user home) on every CMake target via root `subprojects` + `:app`
  `androidComponents.finalizeDsl`, plus `-Wl,--build-id=none` linker args —
  measured two-path byte-diff was in libappmodules.so +
  libreact_codegen_rnsvg.so + libreact_codegen_safeareacontext.so (both
  ABIs). Proof at 94b38da: two different absolute paths → 460/460 zip
  payloads byte-identical, `apksigcopier compare --unsigned` → exit 0,
  signature implant verifies with cert
  1c59c4331c9c8f1fc0e41578ef47ac404396ba7596f5a4c8e94528d4886bceca, and the
  CI-published asset's sha256 equals the /tmp two-path build byte-for-byte
  (a5e65a4f…5740c0). RN 0.88 scanignore: ONLY
  ReactAndroid/publish.gradle carries local maven urls; sdks/ has NO
  hermesc binary (bundle task needs none from node_modules). Maintainer
  recipe draft: apps/android/metadata/com.rootmyandroid.yml.
- **F-Droid Phase 1 COMPLETE (commits 54f0cd3…0ddbe5e, all CI-green):**
  product flavors `fdroid`/`appstore`, dependenciesInfo off, legacy
  packaging, localhost dev-IP pin, ML Kit → ZXing 3.5.3 (TRY_HARDER,
  POSSIBLE_FORMATS QR-only, decode+reset per frame on a single-thread
  executor), `IS_FDROID_BUILD` from `./build-flavor` + metro redirect to
  `./build-flavor.fdroid.ts` (RN 0.88 argv carries the flavor in the
  bundle-output PATH, not the task name — commit 1214c1d). fdroid UI
  gating dump-verified on device (0 Guru chips, everything-free copy, no
  billing). fdroid asset sha256 7aa3a1d2…beaf4d02; appstore asset sha256
  e6880a38…d4184cf (both verified on-device). Kotlin gotcha (CI failure
  43790441412): properties initialize in declaration order — a listener
  consumed by a `val view = X().also{}` must be declared BEFORE it.
- **APK transfer traps (measured 2026-11-16):** the host's wifi eats
  sustained transfers (docs/HANDOFF.md §0) — do NOT move release APKs
  through it (a 17 MB download there is a half-day trap; measured
  streams die or trickle). Plain TCP phone→VPS is filtered by the
  phone's network (nc to :48519 cut at exactly 16 KB; plaintext :443 at
  0 KB), but real TLS to GitHub from the PHONE is fast (17 MB in
  seconds). Working path: `adb shell am start -a
  android.intent.action.VIEW -d <release-asset-URL>` → Chrome downloads
  → on-device `sha256sum` must match the release → `cp` to a paren-free
  path (the device shell chokes on unquoted parens) → `pm install -r`.
  Chrome's APK safety dialog appeared on the first download and
  auto-continued on the immediate retry. Both flavors share the same
  applicationId + signature — `pm install -r` swaps either over the
  other (verified both directions 2026-11-16).
  **SUPERSEDED 2026-11-17 (owner ruling): the browser-download path is
  RETIRED.** Install with `adb push <apk> /data/local/tmp/` then
  `pm install -r /data/local/tmp/<apk>`. `pm` CANNOT read `/sdcard`
  (system_server has no read on `fuse` — measured AVC denial), so the
  file MUST be staged under `/data/local/tmp/`.

### F-Droid submission — MR OPEN, PIPELINE GREEN (2026-11-21)

**MR !58356** — https://gitlab.com/fdroid/fdroiddata/-/merge_requests/58356
(fork `gitlab.com/nyusternie/fdroiddata`, project **89251913**, branch
`com.rootmyandroid`). All 9 pipeline jobs pass, including `fdroid build`
and `check apk` (F-Droid's source build byte-compared against our hosted
binary and matched). The MR now sits in the review queue; expect 2–3
tester rounds (sidecoin took ~7 weeks from first MR to merge).

- **Release it points at:** `v26.11.24` — commit
  `4d9231092907465b8aa6327992338b2ff47a09f9`, asset
  `app-fdroid-release.apk` 17,993,304 bytes.
- **Signing:** our upload key only —
  `/home/gh-runner/secrets/rootmyandroid-upload.keystore` (blackhost),
  alias `rootmyandroid-upload`, cert SHA-256
  `1c59c4331c9c8f1fc0e41578ef47ac404396ba7596f5a4c8e94528d4886bceca`,
  pinned as `AllowedAPKSigningKeys` in both recipe copies. NOTE: with
  Play App Signing, Play re-signs with Google's key, so Play builds and
  sideload/F-Droid builds carry DIFFERENT signatures (same appId, so no
  cross-update without uninstall — expected for upstream-signed apps).
- **Store metadata lives in the fdroiddata repo**, not the app repo:
  `metadata/com.rootmyandroid/en-US/{name,summary,description}.txt` +
  `icon.png` + `phoneScreenshots/` (8 shots). fdroiddata's
  `tools/check-localized-metadata.py` REQUIRES those filenames (the
  Triple-T names `title/short_description/full_description` are
  rejected), and `tools/check-exif-in-images.sh` rejects any PNG carrying
  EXIF/ICC — strip with `convert -strip`.
- **The fdroiddata copy must be the `rewritemeta` OUTPUT**: that CI job
  compares TEXT, so every comment must be gone, `Binaries:` is a block
  list, and `Binaries:` carries a TRAILING SPACE. Our local fdroidserver
  2.4.5 formats differently from the CI's pinned version — the CI diff is
  the authority.
- **Recipe `init:` must materialize the app-local node_modules links.**
  RN resolves `react-native`, `@react-native/codegen` and
  `hermes-compiler` from the APP-local path regardless of `react {}`;
  with `nodeLinker: hoisted` a fresh checkout only has them at the
  workspace root. The recipe symlinks all three into
  `apps/android/node_modules/`.
- **`scanignore` entries that are load-bearing** (each one was a red
  pipeline): `.vendor` (gzip tarball), `apps/desktop` (Cargo.toml without
  a lock), `node_modules/hermes-compiler/hermesc/linux64-bin/hermesc`
  (bundle step needs it; precedent: merged recipe `dev.djara.wafrn_rn`),
  and the four library `build.gradle` files that declare a LOCAL maven
  repo — `react-native/ReactAndroid/publish.gradle`,
  `lottie-react-native`, `react-native-safe-area-context`,
  `react-native-svg`. fdroidserver deletes those files (scandelete
  covers node_modules) and the libraries then lose their `namespace`, so
  autolinking dies with "No package name found". Enumerate with
  `grep -rl 'url "$projectDir|$rootDir|node_modules/react-native/android'`
  over `node_modules/*/android/build.gradle`, never from memory.
- **Autolinking must not shell out to `npx`** on the build VM (offline,
  no TTY): `settings.gradle` invokes the CLI as
  `node <cli>/build/bin.js config` with an app-local → workspace-root
  fallback.
- **NO Shizuku, ever** (owner ruling 2026-11-17): no SDK, no dependency,
  no pairing with the Shizuku app. Capabilities are replicated through
  our own transports (wireless ADB in Rootz, rootzd, WebUSB /scan).
  Measured parity table in docs/HANDOFF.md §10.

### F-Droid COMMUNITY REVIEWS — use the official tester procedure

Reviewing other people's MRs is a separate workflow with its own published
rules: https://gitlab.com/fdroid/wiki/-/wikis/Tips-for-fdroiddata-contributors/Reviewing-new-apps
Read it before every review. The operational version — hard rules, PCAPdroid
capture procedure, report template — is
`.agents/skills/fdroid-review/SKILL.md`.

Three rules that are not negotiable:
1. Pool is `review-requested` + **fewest notes**; "no outside review" means no
   **non-maintainer** comment (check project membership, not just the count).
2. `INTERNET` apps get a network capture (PCAPdroid) started **before** the app
   is opened — `ss` samples and `strings` on the binary are not a network check.
3. Reports use the official template (Basic Function / Policy Compliance /
   Permissions / Network / Language / Security). No freeform prose.

### F-Droid MR SUBMISSION FORMAT — the rule that cost a rejection

**MR !58356 was CLOSED by linsui on 2026-11-21 with exactly one reason:
"Merge Request template is not followed."** The pipeline was fully green —
`fdroid build` and `check apk` both passed — and it was still rejected.
A green pipeline is NOT acceptance.

Two things the template
(`.gitlab/merge_request_templates/Default.md` in fdroiddata) requires that
we got wrong:

1. **The MR description MUST use the template structure**: Abstract (what
   the app does + usage + screenshots), a second Abstract section
   explaining WHY the app exists and its unique value over similar
   F-Droid apps, then the Checklist with every box ticked and justified,
   the title `New app: <name>`, and `/label ~"New App"`.
2. **The MR must contain ONLY `metadata/<applicationId>.yml`.**
   Verbatim from the template: *"Don't add summary/description/changelog/
   images or anything that should be provided in upstream repo. Please
   check the Changes tab to make sure there is no other unrelated files
   added in the MR."* Store metadata (title/summary/description/icon/
   screenshots) belongs in the UPSTREAM app repo — `fastlane/metadata/
   android/<locale>/` or the Triple-T layout — never in the MR.

**Before ANY future submission: read these three, in this order —
`.gitlab/merge_request_templates/Default.md`, `CONTRIBUTING.md`, and
`templates/general.yml` + `templates/build-react-native.yml`.** The
pipeline gates (docs/FDROID-CHECKLIST.md) cover build failures only; the
template covers acceptance.

Prepared artifacts for the re-submission live in
`apps/android/metadata/fdroiddata-submission/` (the exact recipe to push
and the filled MR description).

### What the app actually ships (2026-11-20/21)

Real: device scan (getprop, read-only, no su exec) · backup audit
(PackageManager `allow_backup`) · QR scanner (ZXing) + local device
pairing stored in prefs · encrypted backup upload (AES-256-GCM, key in
the Android Keystore, `POST /v1/backups`, list from
`/v1/backups/list`) · account creation (`POST /v1/accounts`, 16-digit
number persisted) · Tools (live battery, real StatFs storage, links to
the three real `/guides` pages) · audit sync (`POST /v1/device/audit`).
Gate-10 checker: `node apps/android/tools/check-dead-controls.mjs`
(24 controls, 0 dead) — run it after ANY UI change.

## Rootz app (live)


`apps/rootz` (`com.rootmyandroid.rootz`) — plain Gradle/Kotlin, Material 2
(dark, terminal-green identity; 4dp button corners per M2 spec, 8dp spacing
grid). CI: `.github/workflows/rootz.yml` (manual/mobile builds; `preview-apk`
prerelease updated on master). Reference docs:
`apps/rootz/docs/wireless-debugging-setup.md` (§1–8 pairing, §9 connect
phase — every claim below is measured and cited there).

- **Wireless-ADB milestone COMPLETE (measured end-to-end on blueline,
  Pixel 3, Android 12, 2026-11-09):** mDNS discovery (`AdbWifiDiscovery`), SPAKE2 pairing
  (`PairingSession`), TLS connect + shell streams (`AdbConnection`), and
  same-device pairing via notification inline-reply (`PairingNotifier` +
  `PairingReplyReceiver`) all work. `id` / `ls` execute in-app over wireless
  ADB as uid 2000 (shell), ~90ms round-trip.
- **Connect-phase wire protocol (measured):** the `_adb-tls-connect` port
  speaks PLAINTEXT ADB framing until the client sends `A_STLS` (0x534C5453,
  version 0x01000000, no payload); only then does the socket upgrade to
  TLS 1.3 mutual auth. The client certificate must be presented
  UNCONDITIONALLY — adbd's CertificateRequest CA list carries per-key
  issuers (CN = SHA256(pubkey)) that never match a self-signed cert, so a
  default KeyManager sends nothing and the handshake dies with
  PEER_DID_NOT_RETURN_A_CERTIFICATE. After CNXN, adbd sends a stray A_STLS
  packet: ignore it, never echo it (echoing re-triggers the server-side
  handshake).
- **Enrollment trap (measured):** the framework's `AdbDebuggingManager`
  keeps its own grant store (`mKeyMap`, persisted to `adb_temp_keys.xml`)
  separate from adbd's `/data/misc/adb/adb_keys`; `setLastConnectionTime`
  SKIPS `writeKey` when the key is already in `mKeyMap`. Blueline wipes
  `adb_keys` on adbd restart but system_server's `mKeyMap` survives —
  re-pairing then silently does NOT re-enroll and TLS connects fail.
  Repair: Settings → Developer options → "Revoke USB debugging
  authorisations" (clears BOTH stores), re-allow the USB host, re-pair.
- **NSD resilience (measured pain):** failed resolves retry 4× at 1s
  intervals (code=3 / ALREADY_ACTIVE races are common); a watchdog restarts
  discovery (bounded 6×10s) while no endpoint is known — sessions started
  between mDNS announcements otherwise sit silent until the next state
  change. `settings put global adb_wifi_enabled 1` does NOT stick on this
  build (SystemUI consent gate reverts it) — toggle in the UI.
- **Output UX:** terminal-style append-only scrollback with auto-scroll,
  Clear button, explicit "(no output)" marker, busy state on Send, and a
  "wireless adb: ready/searching" status line driven by discovery. The log
  card has a FIXED 320dp height in a scrolling page — as a weighted sibling
  of the input cards it was squeezed to 26dp and output was invisible
  (measured via uiautomator bounds; uiautomator dump is the text-only way
  to inspect the UI — never screenshot into context, rule 6).
- **Relay DAEMON lane in the APK — SHIPPED + VERIFIED LIVE 2026-11-11
  on blueline (Pixel 3, Android 12) through the PRODUCTION relay**
  (owner ruling 2026-11-11: the APK IS the daemon on non-rooted phones;
  rootzd stays the root tier): RelayIdentity.kt (Ed25519 keypair at
  filesDir/relay/device.key; device_id = hex sha256(pubkey)),
  RelayDaemon.kt (pair-once marker filesDir/relay/paired → POST
  /v1/relay/challenge → wss tunnel → first-message Ed25519 auth; backoff
  1s→60s+jitter; 90 frames/s pacing under the relay's 100/s cap; 10-min
  idle reap; 403/4403 revoked park, 409 key-conflict operator-fatal park
  — relay.rs parity), E2eSession.kt daemon functions (daemon fixture
  replay tests in E2eVectorTest). Execution: each stdin LINE is a
  one-shot through the app's wireless-ADB loop (AdbConnection, uid 2000)
  — no persistent sh, no cwd/env across lines (a local Runtime sh would
  run at the app's lesser uid). Every line passes
  CommandGuard.decisionFor first; gated commands are REFUSED with an
  stderr frame + on-device receipt (interactive approval of remote
  commands is a later build). Owner ruling 2026-11-11: a line exactly
  `exit` (trimmed) emits exit{code:0} and closes the session
  server-side — the session is marked `closing` and the drain SENDS the
  exit frame BEFORE removing it (live probe caught the first cut
  removing first: the drain drops frames for removed sessions).
  Browser /terminal owner-verified: `id` → uid=2000(shell),
  `getprop ro.product.model` → Pixel 3, `exit` → code 0.
- **Live-test lessons (2026-11-11):** (1) cross-account client attach is
  refused by the relay with the SAME 404 as an unknown device
  (anti-enumeration — rootmyandroid-relay/src/index.js:74-76); browsers
  surface it as WS close 1006 — always drive /terminal with the account
  the device is ACTUALLY paired to (account numbers stay out of the
  repo, rule 3a). (2) The daemon is bound to the app process (no
  foreground service yet): with the screen off the backgrounded app's
  network access is suspended (observed: challenge POSTs fail in that
  state, recover on wake — Android doze/background restrictions); a
  foreground service is the TOP follow-up. (3) Always dispatch
  rootz.yml with an explicit `--ref master` — `gh workflow run` bare,
  fired seconds after a push, was observed resolving a STALE head
  (2026-11-11: run built f5070fa instead of the just-pushed 67cbecf).

## Rootz daemon (live)

`apps/rootzd` — Rust, single static binary (artifacts + Magisk module on
the `rootzd-preview` prerelease; CI `.github/workflows/rootzd.yml`: cargo
tests auto-run on every push, the full pipeline — incl. Android SDK setup
— on manual dispatch). Canonical protocol doc:
`apps/rootzd/docs/e2e-protocol.md` (v1); the web client is
`apps/web/src/lib/e2e.ts`, served at `/terminal` (`src/scripts/terminal.ts`).

- **Tiers** (from own uid, `src/main.rs`): root (uid 0, via `su`,
  persistable), shell (uid 2000, via `adb shell`, not persistable), app
  (embedded fallback). The tier label rides in `session_info`; the relay
  path is identical for all tiers.
- **Transports:** the relay tunnel is PRIMARY (since v26.11.9): outbound
  `wss://relay.rootmyandroid.com/tunnel?device=<device_id>`; pairing
  (`POST /v1/relay/devices`, account digits-only + device_pubkey) once per
  account (marker file in the state dir), then challenge
  (`POST /v1/relay/challenge`) + first-message Ed25519 auth per dial-out.
  Reconnect: exponential backoff 1s→60s+jitter, reset after `authed`;
  403/4403 (revoked) parks the lane, 409 (key bound elsewhere) is
  operator-fatal. The LAN listener (127.0.0.1:7357, `adb forward`) is
  fallback/dev only — it has NO AUTH. Pairing/challenge issuance live in
  `rootmyandroid-api`; the relay worker in `rootmyandroid-relay` (both
  siblings — rule 9).
- **E2E crypto:** Ed25519 identity (`device_id` = hex SHA-256(pubkey)) at
  `<state>/device.key` (0600; default state dir `/data/local/tmp/rootzd`),
  X25519 ephemeral per session, HKDF-SHA256, ChaCha20-Poly1305. The
  cross-implementation fixture (`apps/rootzd/tests/fixtures/e2e-vector.json`)
  is MIRRORED with `apps/web/src/lib/fixtures/e2e-vector.json` — regenerate
  both together with `apps/web/tools/gen-e2e-vector.mjs`, never edit one
  copy. Inner `d` payloads chunk at 32 KiB (`MAX_INNER_CHUNK`) so wrapped
  frames stay under the relay's 64 KiB cap.
- **VERIFIED LIVE 2026-11-10 on redfin (Pixel 5, Android 14):** full
  round-trip (pair → challenge → auth → E2E handshake → encrypted stdin →
  shell → stdout → exit → close) through the PRODUCTION relay in BOTH
  tiers (`uid=2000(shell) context=u:r:shell:s0` and
  `uid=0(root) context=u:r:magisk:s0`), and owner-confirmed in a real
  browser at `/terminal`. Driver: `apps/rootzd/tools/e2e-probe.mjs` — a
  scriptable client (Node ≥22) that self-validates against the fixture
  before networking; `--idle-before-cmd N` exercises mid-session DO
  eviction.
- **Relay DO hibernation incident (2026-11-10, RESOLVED):** the relay's
  Durable Object lost its in-memory daemon reference on eviction → idle
  devices refused clients (503 at the upgrade → browsers saw 1006). Fixed
  relay-side (restore-on-wake via socket attachments, relay@877b8c5) and
  re-validated with the probe (idle-connect + 75s mid-session eviction).
  Paper trail: `docs/HANDOFF-2026-11-10-relay-hibernation.md`,
  `docs/HANDOFF-REPLY-2026-11-10-relay-hibernation.md`,
  `docs/HANDOFF-2026-11-10-relay-hibernation-validation.md`.
- **Open items:** no device-list endpoint yet (`/terminal` takes the
  device_id manually — API-team handoff still open,
  `apps/rootzd/docs/relay-api-todo-2026-11-10.md`); the audit log and an
  operator-facing revoke endpoint are NOT in this build (`src/main.rs`
  header); the daemon silently drops undecodable inner frames — a one-line
  diagnostic log is PROPOSED, awaiting owner ruling (do not add unruled);
  a real PTY (forkpty) replaces the piped sh in a later release.

## On-device LLM agent harness (Lane B — demo stage, 2026-11-12)

`apps/rootzd/tools/agent-demo.mjs` drives llama-server on-device
(redfin, port-forwarded 127.0.0.1:8399) through a guard MIRRORED 1:1
from the Rootz app's `CommandGuard.kt` (fail-closed: SAFE-only with
empty approval stores). Flags: `--serial --url --turns --temp --mode
loopguard|orchestrate|prune`. Every run writes a transcript to
`apps/rootzd/tools/results/agent-demo-<stamp>.log` from a `finally`
block; logs are force-added over the `results/` ignore.

Seven logged runs (all committed; the profile page carries the table):
greedy decoding CANNOT be rescued by any tested driver-side mechanism
— checklist prompt (made it worse: rigid 3-cycle), repeat-refusal
guard (4/4 refused, loop persisted), orchestrate mode (7 nudges,
cycle survived), prune mode (cycle broke, wandered, never finished).
Only sampling worked: temp 0.6 + repeat guard completed the audit in
6–9 turns at ~1.8–2.2 t/s, but with real variance (one run reported
"no root" on this Magisk device — a false negative is ON RECORD).
Deployment rule: temp ≥ 0.5, repeat guard on, verify every negative
the agent reports (treat "not found" as "unknown" — toybox traps
measured: `grep -E` rejects GNU `\b`; `find` rc=1 on missing first
path; `/system/xbin` absent on redfin).

Thermal aborts were removed from THIS harness only (owner ruling
2026-11-11: test device); bench-phase*/bench-soak keep their thermal
caps — their published numbers depend on them. Full handoff:
`docs/HANDOFF-2026-11-12-on-device-agent-harness.md`.
