# Rootz Daemon (`rootzd`)

Rust-based daemon that runs on a **rooted Android device** (owner ruling
2026-11-07). The **Rootz PRO** professional tools — Terminal Editor, Log
Analysis ($15 / 365 days) — attach to this daemon. Mascot: **Colonel Su**
(name ruled FINAL 2026-11-08, after the 2026-11-07 interim "Colonel Rewt").

Rootz PRO applies to BOTH the Rootz APK product and this daemon (owner
ruling 2026-11-08).

Status: **v1 in progress** (daemon team) — v26.11.9: the relay tunnel
client + E2E-encrypted sessions landed (docs/relay-handoff.md §2,
docs/e2e-protocol.md — pairing, challenge, `wss` dial-out, per-session
piped `/system/bin/sh` multiplex; env `ROOTZD_ACCOUNT` arms the lane).
v26.11.8: piped `/system/bin/sh` bridge, uid-based tier detection,
localhost listener (default bind 127.0.0.1; NO AUTH — kept as the dev/LAN
fallback; the authenticated path is the relay tunnel).
Binary renamed `rootz` -> `rootzd` (owner ruling 2026-11-08, superseding the
2026-11-07 name freeze): the Rootz brand moves to the no-wipe APK product
(`apps/rootz`); the daemon carries the conventional d-suffix.

Notes for the daemon team:

- Not a pnpm workspace package (no `package.json`) — `pnpm -r` scripts skip
  it; CI is `../../.github/workflows/rootzd.yml` (cargo tests on master
  pushes touching the crate; manual dispatch builds + packages + publishes
  the rolling prerelease).
- Package ids are owned elsewhere: `com.rootmyandroid` (Root My Android
  Android + iOS editions), `com.rootmyandroid.guardian_angel` (Guardian
  Angel). The daemon is installed on rooted devices, not distributed as an
  APK — distribution mechanism TBD by you.
- Repo rules (../.. /AGENTS.md) apply: no guessing device behavior, read-only
  by default, never wipe third-party app data.

## Tiers and privilege persistence

Canonical reference: [docs/privilege-tiers.md](docs/privilege-tiers.md) —
the three uid tiers (root / shell / app), what each can actually do, and
the reboot-vs-root persistence table (incl. the blueline adbd enrollment
trap). Install and dev-usage sections below defer to it.

## Build (remote only — NEVER on the local host)

    scripts/build-rootzd-remote.sh [target]   # default aarch64-linux-android

Uses `.env.local` (gitignored — see `.env.local.example`) for the runner
connection. Artifacts land in `apps/rootzd/dist/` (gitignored).

## Install (root tier — customer path): Magisk module zip (Option B)

Owner ruling 2026-11-09. Package + verify on device:

    scripts/package-rootzd-module.sh    # needs the built binary in dist/
    adb push apps/rootzd/dist/rootzd-magisk-module-v26.11.9.zip /data/local/tmp/
    adb shell "su -c 'magisk --install-module /data/local/tmp/rootzd-magisk-module-v26.11.9.zip'"
    adb reboot                          # Magisk finalizes module installs at boot

Module source files live in `module/` (`module.prop`, `service.sh`,
`customize.sh` — arm64-only guard + exec-bit fix). The module **supersedes**
the manual `/data/adb/service.d/rootzd.sh` install — never run both (the
second bind to 127.0.0.1:7357 collides). Customers install by tapping
"Install from storage" in the Magisk app; enable/disable/uninstall is then
one tap, and the module survives OTAs via Magisk's own mechanism.
Verified on redfin 2026-11-09 (RS-44; v26.11.8 EOF fix RS-45).

## Usage (dev, shell tier — no root needed)

    adb push apps/rootzd/dist/rootzd-aarch64-linux-android /data/local/tmp/rootzd
    adb shell chmod 755 /data/local/tmp/rootzd
    adb shell 'nohup /data/local/tmp/rootzd >/dev/null 2>&1 </dev/null &'
    adb forward tcp:7357 tcp:7357
    nc 127.0.0.1 7357          # remote /system/bin/sh as uid 2000 (no PTY in v26.11.8)

Client contract (pinned by RS-45): the daemon closes the connection once
the piped shell exits (e.g. after an `exit` line) — clients read until
EOF; they do NOT need to half-close first (pre-fix builds deadlocked
against wait-for-EOF clients; fixed in the v26.11.8 line via socket-level
shutdown()).

`ROOTZD_LAN_BIND=0.0.0.0` exposes the LAN fallback (camera path) — only after
pairing lands.
