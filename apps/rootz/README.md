# Rootz

Rust-based daemon that runs on a **rooted Android device** (owner ruling
2026-11-07). The **Rootz Pro** professional tools — Terminal Editor, Log
Analysis ($15 / 365 days) — attach to this daemon. Mascot: **Colonel Rewt**.

Status: **v1 in progress** (daemon team) — terminal v0.1 landed: piped
`/system/bin/sh` bridge, uid-based tier detection, localhost listener
(default bind 127.0.0.1; NO AUTH until the pairing/security pass).
Binary name `rootz` is FROZEN (brand-churn protection).

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

    scripts/build-rootz-remote.sh [target]   # default aarch64-linux-android

Uses `.env.local` (gitignored — see `.env.local.example`) for the runner
connection. Artifacts land in `apps/rootz/dist/` (gitignored).

## Usage (dev, shell tier — no root needed)

    adb push apps/rootz/dist/rootz-aarch64-linux-android /data/local/tmp/rootz
    adb shell chmod 755 /data/local/tmp/rootz
    adb shell 'nohup /data/local/tmp/rootz >/dev/null 2>&1 </dev/null &'
    adb forward tcp:7357 tcp:7357
    nc 127.0.0.1 7357          # remote /system/bin/sh as uid 2000 (no PTY in v0.1)

`ROOTZ_LAN_BIND=0.0.0.0` exposes the LAN fallback (camera path) — only after
pairing lands.
