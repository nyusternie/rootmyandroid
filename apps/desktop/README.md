# Root My Android Desktop

**Status: SCAFFOLD (owner ruling 2026-11-11 — "minimum scaffolding, just
enough so that we know it's coming soon").** Not built, not wired into CI,
not functional yet.

The **final relay CLIENT** (owner ruling 2026-11-11, relay roles corrected):

| role    | component                                                        |
| ------- | ---------------------------------------------------------------- |
| daemon  | **Rootz APK** on the non-rooted phone (uid 2000 via wireless ADB) |
| client  | web `/terminal` (shipped), Root My Android android/ios RN apps, **this app** |

Stack: **Tauri v2** (Rust shell, `src-tauri/`) + **Vite + Tailwind v4**
frontend (`index.html`, `src/`).

## What lands here (later phases, in order)

1. The relay client ported from the Rootz APK's removed client role
   (`RelayConnection.kt` + the `E2eSession.kt` client session, themselves a
   Kotlin port of the shipped, cross-tested `apps/web/src/lib/e2e.ts`).
   Canonical protocol: `apps/rootzd/docs/e2e-protocol.md` v1; the
   cross-implementation fixture (`apps/rootzd/tests/fixtures/e2e-vector.json`)
   is replayed here before any networking is trusted — same discipline as
   the web client and the APK.
2. Pairing UX: 16-digit account number typed into the app (Mullvad-style
   account model — no email).
3. Terminal UI consistent with the Rootz terminal-green identity.

## Building (when the time comes)

`pnpm install` at the repo root, then `pnpm --filter rootmyandroid-desktop
dev` (vite) or `… tauri dev` (full shell — requires the system webkitGTK /
AppIndicator toolchain per Tauri v2 docs). All JS dependency versions are
EXACT pins (repo rule 8); Rust crates are `=`-pinned in
`src-tauri/Cargo.toml` and will be locked by a committed `Cargo.lock` once
the app is first built.
