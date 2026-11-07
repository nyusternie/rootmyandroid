<!-- README.md -->
<p align="center">
  <img src="apps/web/public/og-image.png" alt="Root My Android — free in-browser Android analysis and rooting plans" width="100%" />
</p>

# Root My Android

[![Web CI](https://github.com/nyusternie/rootmyandroid/actions/workflows/web.yml/badge.svg?branch=master)](https://github.com/nyusternie/rootmyandroid/actions/workflows/web.yml)
[![codecov](https://codecov.io/gh/nyusternie/rootmyandroid/branch/master/graph/badge.svg)](https://codecov.io/gh/nyusternie/rootmyandroid)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DDC84.svg)](LICENSE)

**Analyze any Android in your browser — no installs, no account — and get a
real rooting plan.** Root My Android is open source: the static website, the
mobile apps, and the shared client libraries all live in this public
monorepo. Accounts on the hosted service are Mullvad-style: no email, no
password, just an account number.

**https://rootmyandroid.com**

## Apps

| App | Path | What it is |
| --- | ---- | ---------- |
| **Web** | [`apps/web`](apps/web) | The Astro 7 static site behind rootmyandroid.com — free in-browser device scan (read-only ADB over WebUSB), guides library, product profiles, and the account portal. Content pages ship zero JavaScript. |
| **Rootz** (Android) | [`apps/android`](apps/android) | Device scan, paired Guardian Angel devices, encrypted backups, and tools (React Native 0.88, `com.rootmyandroid`). Backups are encrypted client-side with a user-held key — the API only ever sees ciphertext. |
| **RootMyAndroid** (iOS) | [`apps/ios`](apps/ios) | The iOS monitoring edition (React Native 0.88, `com.rootmyandroid`). |
| **Guardian Angel** (Android) | [`apps/guardian`](apps/guardian) | Parental-control companion that runs in the background on the managed device and syncs to a Rootz account (React Native 0.88, `com.rootmyandroid.guardianangel`). Uninstall protection via the device-administrator API. |
| **Shared client** | [`packages/shared`](packages/shared) | Theme + typed `/v1` API client shared by the mobile apps (TypeScript source, no build step). |

## How it works

1. **Scan free** — plug an Android into a WebUSB-capable desktop browser and
   analyze it entirely client-side. Read-only: `getprop` and inspection
   commands only, nothing leaves the browser unless you explicitly save the
   report to an account.
2. **Create an account** — random account number, no email, no personal data.
3. **Pair a device** — install Guardian Angel on the managed device and sync
   it to the account, or open the Rootz app for device scan, paired devices,
   encrypted backups, and tools.

## Architecture

- **`apps/web`** — purely static **Astro 7** site, deployed to Cloudflare
  Pages. Content pages ship zero JavaScript; vanilla TS modules on the app
  pages talk to the API at `rootmyandroid.com/v1`.
- **`rootmyandroid-api`** (sibling repo) — the Cloudflare Worker serving
  `/v1`: accounts, account ledger, audits, first-party analytics.
- **`rootmyandroid-admin`** (sibling repo) — the analytics dashboard.
- **`apps/android` / `apps/ios` / `apps/guardian`** — React Native 0.88 apps
  (Rootz utility, iOS monitoring edition, Guardian Angel).
- **`packages/shared`** — theme + typed `/v1` API client shared by the apps.

Analytics are first-party only (`/v1/analytics/*`); there is intentionally no
third-party tracking.

## Repository layout (pnpm workspace)

```
/
├── apps/
│   ├── web/          # Astro 7 static site (this README's banner lives in
│   │                 # apps/web/public/og-image.png)
│   ├── android/      # Rootz (Android utility): RN 0.88 app
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
| **Colonel Rewt** (beard, glasses, monk robe, SU-staff) | The Rootz Pro professional-tools product |

## Docs

- [HANDOFF.md](HANDOFF.md) — historical decision log: the Nitro→Halo
  rebrand handoff and the pricing history through the 2026-11-05 top-up
  model
- [AGENTS.md](AGENTS.md) — standing working rules for contributors and AI
  agents (current authority)

## License

[MIT](LICENSE) © 2026 Root My Android LLC.
