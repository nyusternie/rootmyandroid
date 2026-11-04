<!-- README.md -->
<p align="center">
  <img src="apps/web/public/og-image.png" alt="Root My Android — free in-browser Android analysis and rooting plans" width="100%" />
</p>

# Root My Android

[![Web CI](https://github.com/nyusternie/rootmyandroid/actions/workflows/web.yml/badge.svg?branch=master)](https://github.com/nyusternie/rootmyandroid/actions/workflows/web.yml)
[![codecov](https://codecov.io/gh/nyusternie/rootmyandroid/branch/master/graph/badge.svg)](https://codecov.io/gh/nyusternie/rootmyandroid)

**Analyze any Android in your browser — no installs, no account — and get a
real rooting plan.** Paid plans add device monitoring (**Guardian Angel**) and
professional tooling (**Guru Daemon**). Mullvad-style accounts: no email, no
password, just an account number.

**https://rootmyandroid.com**

## Products

One account balance, two products, and a free core that needs no account at
all (owner-locked pricing, 2026-11-04 — HANDOFF.md §10.2):

| Product | Plan | Price | Includes |
| ------- | ---- | ----- | -------- |
| **Free core** | Free | $0 forever | In-browser device scan (read-only ADB over WebUSB), bootloader & unlock detection, root-method selection, full guides library — no account needed |
| **Guardian Angel** | Basic | 1 Halo ($5) / 30 days | Read installed apps, read messages, read call logs |
| **Guardian Angel** | Elite | 2 Halo ($10) / 30 days | Everything in Basic, plus view photos & media, view camera & video |
| **Guru Daemon** | Pro | 3 Halo ($15) / year | Terminal Editor, Log Analysis — an independent lane that combines with any Guardian Angel plan or stands alone |

### Guardian Angel — monthly monitoring subscriptions

Two cumulative tiers (Basic → Elite) for watching over a device. Renews every
30 days.

### Guru Daemon — professional tools, yearly

A limited professional feature set (Terminal Editor, Log Analysis), billed
once a year. A user can subscribe to a Guardian Angel plan only, unlock Guru
Daemon Pro only, both, or neither.

## Halo — the credit unit

Halo is the in-account balance. Base rate **$5 = 1 Halo** (packs `halo_1` /
`halo_4` / `halo_6`). The API is the single source of truth for the plan
catalog (`GET /v1/halo/plans`); clients render prices dynamically and never
hard-code them.

## How it works

1. **Scan free** — plug an Android into a WebUSB-capable desktop browser and
   analyze it entirely client-side. Read-only: `getprop` and inspection
   commands only, nothing leaves the browser unless you explicitly save the
   report to an account.
2. **Create an account** — random account number, no email, no personal data.
3. **Top up Halo** — crypto-first payments direction (provider selection in
   progress; never hard-coded).
4. **Subscribe** — Guardian Angel monthly, Guru Daemon Pro yearly, or both.

## Architecture

- **`apps/web`** — purely static **Astro 7** site, deployed to Cloudflare
  Pages. Content pages ship zero JavaScript; vanilla TS modules on the app
  pages talk to the API at `rootmyandroid.com/v1`.
- **`rootmyandroid-api`** (sibling repo) — the Cloudflare Worker serving
  `/v1`: accounts, Halo ledger, plan catalog, audits, first-party analytics.
- **`rootmyandroid-admin`** (sibling repo) — the analytics dashboard.
- **`apps/android` / `apps/ios` / `apps/guardian`** — React Native 0.88 apps
  (Rooted utility, iOS monitoring edition, Guardian).
- **`packages/shared`** — theme + typed `/v1` API client shared by the apps.

Analytics are first-party only (`/v1/analytics/*`); there is intentionally no
third-party tracking.

## Repository layout (pnpm workspace)

```
/
├── apps/
│   ├── web/          # Astro 7 static site (this README's banner lives in
│   │                 # apps/web/public/og-image.png)
│   ├── android/      # Rooted (Android utility): RN 0.88 app
│   ├── ios/          # RootMyAndroid (iOS monitoring edition): RN 0.88 app
│   └── guardian/     # React Native 0.88 app (com.rootmyandroid.guardian)
├── packages/
│   └── shared/       # rootmyandroid-shared — theme + typed /v1 API client
├── .agents/skills/   # Project agent skills (brand-image: brand canon)
├── .github/workflows/web.yml   # Web CI + Cloudflare Pages deploy gate
├── pnpm-workspace.yaml
└── package.json      # root scripts only; private, no publish
```

## Development

| Task            | Command                    |
| --------------- | -------------------------- |
| Install         | `pnpm install`             |
| Dev server      | `pnpm dev`                 |
| Type-check      | `pnpm check`               |
| Test (all pkgs) | `pnpm test`                |
| Build (static)  | `pnpm build`               |

**Tests gate deploys.** Every push to `master` runs check → test:coverage →
build in CI, uploads lcov to Codecov (flag `web`), and only then deploys
`apps/web/dist` to Cloudflare Pages. pnpm 11.x, Node ≥ 18.17 (CI uses 22).

## Brand

Three Android-green characters, defined in
[`.agents/skills/brand-image/`](.agents/skills/brand-image/SKILL.md) (read it
before any image task):

| Character | Fronts |
| --------- | ------ |
| **SU superhero** (cape + SU diamond shield) | Root My Android — OG card, landing hero, favicons |
| **Guardian Angel** (halo) | The monitoring product |
| **Guru Daemon** (beard, glasses, monk robe, SU-staff) | The professional-tools product |

## Docs

- [HANDOFF.md](HANDOFF.md) — full system handoff: architecture, deploy
  pipeline, rebrand + pricing history, SEO roadmap
- [AGENTS.md](AGENTS.md) — standing working rules for contributors and AI
  agents
