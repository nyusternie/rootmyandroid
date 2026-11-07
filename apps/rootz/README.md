# Rootz

Rust-based daemon that runs on a **rooted Android device** (owner ruling
2026-11-07). The **Rootz Pro** professional tools — Terminal Editor, Log
Analysis ($15 / 365 days) — attach to this daemon. Mascot: **Colonel Rewt**.

Status: **scaffold only** (bare `cargo` binary crate, no functionality).
Another team takes over v1 scope from here.

Notes for the daemon team:

- Not a pnpm workspace package (no `package.json`) — `pnpm -r` scripts skip
  it; wire CI/build yourself when v1 lands.
- Package ids are owned elsewhere: `com.rootmyandroid` (Root My Android
  Android + iOS editions), `com.rootmyandroid.guardianangel` (Guardian
  Angel). The daemon is installed on rooted devices, not distributed as an
  APK — distribution mechanism TBD by you.
- Repo rules (../.. /AGENTS.md) apply: no guessing device behavior, read-only
  by default, never wipe third-party app data.
