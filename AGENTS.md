# AGENTS.md — Root My Android

Guidance for AI agents (and humans) working in this repository.

## Mission

Restore and modernize rootmyandroid.com as a paid service (~$5/mo, Mullvad-style
account model: no email, account-number-only). The core product uses **ADB** to
scan and analyze a physical Android device and produce a rooting / upgrade plan.
Advanced features will be paywalled; free tier covers basic scanning and docs.

## Repository layout (pnpm workspace)

```
/
├── apps/
│   └── web/          # Next.js 13 (pages router) + Markdoc docs site, static export
├── packages/         # shared workspace packages (created as needed)
├── pnpm-workspace.yaml
└── package.json      # root scripts only; private, no publish
```

- Package manager: **pnpm 11.x** (see `packageManager` in root package.json).
  Do not commit `node_modules`, `yarn.lock`, or `package-lock.json`.
- Node >= 18.17 required.

## Commands

| Task            | Command                    |
| --------------- | -------------------------- |
| Install         | `pnpm install`             |
| Dev server      | `pnpm dev`                 |
| Lint            | `pnpm lint`                |
| Test (all pkgs) | `pnpm test`                |
| Build + export  | `pnpm build`               |

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
4. **Static export.** `apps/web` uses `next build && next export`
   (`out/` directory). Do not add server-only Next.js features (API routes,
   SSR `getServerSideProps`, `next/image` loader services) to `apps/web`.
   Dynamic/backend functionality belongs in a separate worker/package.
5. **The docs pages under `apps/web/src/pages/docs/` are leftover template
   content** (CacheAdvance/Tailwind template). Treat them as placeholders to be
   replaced with real product content, not as source-of-truth product logic.

## Payments direction (planning)

- Preference: crypto-first, but support fiat methods that auto-convert to
  crypto **without a bank account**. Candidate processors to evaluate:
  BTCPay Server (self-hosted, no KYC), NOWPayments, Coinbase Commerce,
  and fiat on-ramps that settle to crypto. Final selection TBD — do not
  hard-code a provider before one is chosen.
- Mullvad-style accounts: random account number, no personal data, time-based
  credit. Design all billing code around that model.

## ADB / device analysis direction (planning)

- The product will communicate with devices via ADB (WebUSB in the browser is
  the likely transport; verify before committing).
- Device scanning, bootloader/unlock detection, and root-method selection are
  the free core; advanced features (automated flashing, backups, fleet
  management) are candidates for the paid tier — still to be defined.
