<!-- README.md -->
<p align="center">
  <img src="apps/web/public/og-image.png" alt="Root My Android — free in-browser Android analysis and rooting plans" width="100%" />
</p>

# Root My Android

[![Web CI](https://github.com/nyusternie/rootmyandroid/actions/workflows/web.yml/badge.svg?branch=master)](https://github.com/nyusternie/rootmyandroid/actions/workflows/web.yml)
[![codecov](https://codecov.io/gh/nyusternie/rootmyandroid/branch/master/graph/badge.svg)](https://codecov.io/gh/nyusternie/rootmyandroid)

**Analyze any Android in your browser — no installs, no account — and get a
real rooting plan.** Paid plans add device monitoring (**Guardian Angel**) and
professional tooling (**Rooted Pro**). Mullvad-style accounts: no email, no
password, just an account number.

**https://rootmyandroid.com**

## Products

One account, two products, and a free core that needs no account at
all (owner-locked pricing, 2026-11-05):

| Product | Plan | Price | Includes |
| ------- | ---- | ----- | -------- |
| **Free core** | Free | $0 forever | In-browser device scan (read-only ADB over WebUSB), bootloader & unlock detection, root-method selection, full guides library — no account needed |
| **Guardian Angel** | Lite | $5 / 30 days | Read installed apps, read messages — up to 5 devices per account |
| **Guardian Angel** | Pro | $15 / 30 days | Everything in Lite, plus read call logs, view photos & media, view camera & video |
| **Rooted** | Pro | $15 / year | Terminal Editor, Log Analysis — an independent lane that combines with any Guardian Angel plan or stands alone |

### Guardian Angel — monthly monitoring subscriptions

Two cumulative tiers (Lite → Pro) for watching over a device. Each top-up
adds 30 days — no auto-renewal; switch between Lite and Pro anytime.

### Rooted Pro — professional tools, yearly

A limited professional feature set (Terminal Editor, Log Analysis). Each
top-up adds 365 days. A user can subscribe to a Guardian Angel plan only,
unlock Rooted Pro only, both, or neither.

## Payments — top-ups, crypto-first

Subscriptions are prepaid top-ups (Mullvad-style): add time whenever you like
— no auto-renewal, no stored card. Crypto payments are live and get **15%
off** (owner ruling 2026-11-05); credit card checkout is mocked in the UI and
activates once our merchant account is approved.

Legacy: the retired Halo credit unit ($5 = 1 Halo; packs `halo_1` / `halo_4` /
`halo_6`) is still purchasable in the interim and converts to subscription
time on the backend when the plan system lands. `/halo` and `/nitro` 301 to
`/pricing`. The API remains the single source of truth for prices; clients
render them dynamically and never hard-code them.

## How it works

1. **Scan free** — plug an Android into a WebUSB-capable desktop browser and
   analyze it entirely client-side. Read-only: `getprop` and inspection
   commands only, nothing leaves the browser unless you explicitly save the
   report to an account.
2. **Create an account** — random account number, no email, no personal data.
3. **Top up** — crypto payments live with 15% off; cards mocked pending
   merchant approval.
4. **Subscribe** — Guardian Angel Lite/Pro (30-day top-ups), Rooted Pro
   (365 days), or both.

## Architecture

- **`apps/web`** — purely static **Astro 7** site, deployed to Cloudflare
  Pages. Content pages ship zero JavaScript; vanilla TS modules on the app
  pages talk to the API at `rootmyandroid.com/v1`.
- **`rootmyandroid-api`** (sibling repo) — the Cloudflare Worker serving
  `/v1`: accounts, account ledger, plan catalog (in progress), audits,
  first-party analytics.
- **`rootmyandroid-admin`** (sibling repo) — the analytics dashboard.
- **`apps/android` / `apps/ios` / `apps/guardian`** — React Native 0.88 apps
  (Rooted utility, iOS monitoring edition, Guardian Angel).
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
│   └── guardian/     # React Native 0.88 app (com.rootmyandroid.guardianangel)
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
| **Guru Daemon** (beard, glasses, monk robe, SU-staff) | The Rooted Pro professional-tools product |

## Docs

- [HANDOFF.md](HANDOFF.md) — full system handoff: architecture, deploy
  pipeline, rebrand + pricing history, SEO roadmap
- [AGENTS.md](AGENTS.md) — standing working rules for contributors and AI
  agents
