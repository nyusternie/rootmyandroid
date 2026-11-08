# Rootz Daemon (`rootzd`)

Rust-based daemon that runs on a **rooted Android device** (owner ruling
2026-11-07). The **Rootz PRO** professional tools — Terminal Editor, Log
Analysis ($15 / 365 days) — attach to this daemon. Mascot: **Colonel Rewt**.

Rootz PRO applies to BOTH the Rootz APK product and this daemon (owner
ruling 2026-11-08).

Status: **v1 in progress** (daemon team) — terminal v0.1 landed: piped
`/system/bin/sh` bridge, uid-based tier detection, localhost listener
(default bind 127.0.0.1; NO AUTH until the pairing/security pass).
Binary renamed `rootz` -> `rootzd` (owner ruling 2026-11-08, superseding the
2026-11-07 name freeze): the Rootz brand moves to the no-wipe APK product
(`apps/rootz`); the daemon carries the conventional d-suffix.

Notes for the daemon team:

- Not a pnpm workspace package (no `package.json`) — `pnpm -r` scripts skip
  it; wire CI/build yourself when v1 lands.
- Package ids are owned elsewhere: `com.rootmyandroid` (Root My Android
  Android + iOS editions), `com.rootmyandroid.guardian_angel` (Guardian
  Angel). The daemon is installed on rooted devices, not distributed as an
  APK — distribution mechanism TBD by you.
- Repo rules (../.. /AGENTS.md) apply: no guessing device behavior, read-only
  by default, never wipe third-party app data.

## Build (remote only — NEVER on the local host)

    scripts/build-rootzd-remote.sh [target]   # default aarch64-linux-android

Uses `.env.local` (gitignored — see `.env.local.example`) for the runner
connection. Artifacts land in `apps/rootzd/dist/` (gitignored).

## Usage (dev, shell tier — no root needed)

    adb push apps/rootzd/dist/rootzd-aarch64-linux-android /data/local/tmp/rootzd
    adb shell chmod 755 /data/local/tmp/rootzd
    adb shell 'nohup /data/local/tmp/rootzd >/dev/null 2>&1 </dev/null &'
    adb forward tcp:7357 tcp:7357
    nc 127.0.0.1 7357          # remote /system/bin/sh as uid 2000 (no PTY in v0.1)

`ROOTZD_LAN_BIND=0.0.0.0` exposes the LAN fallback (camera path) — only after
pairing lands.
