# Privilege Tiers — the canonical reference (rootzd + Rootz app)

This is the ONE authoritative document for the daemon's privilege tiers,
what each tier can actually do on-device, and how privilege persists
across reboots and adbd restarts. Tier notes elsewhere (`src/main.rs`
header, AGENTS.md, install READMEs) defer to this file; if they disagree,
this file wins and the other file gets fixed.

Every claim below is either measured on our test hardware (device + date
noted) or cited to a source file in this repo / an AOSP platform fact. No
guessing (repo rule 3).

---

## 1. The three tiers

Detected from the daemon's own uid at startup (`src/main.rs`, `Tier` enum);
the label rides in every session's `session_info` frame
(`docs/e2e-protocol.md` §3).

| tier label | uid | how the daemon gets started |
| ---------- | --- | --------------------------- |
| `root`     | 0    | via `su` — the Magisk module (`module/service.sh` runs late-boot as root) |
| `shell`    | 2000 | via `adb shell` (USB or wireless ADB) — Shizuku-style exec |
| `app`      | other | embedded inside the Android-edition app process — sandboxed fallback |

Verified live on redfin (Pixel 5, Android 14, 2026-11-10): full relay
round-trips returned `uid=0(root) context=u:r:magisk:s0` AND
`uid=2000(shell) context=u:r:shell:s0` — both tiers, one binary
(AGENTS.md "Rootz daemon (live)").

## 2. What each tier can actually do

- **root (uid 0):** unrestricted. Reads/writes any app's private data,
  kills any process, changes any system setting. **Consequence:** the
  client-side CommandGuard (§5) matters most at this tier — a destructive
  command here is unrecoverable, and repo rule 6 (never wipe third-party
  app data) can only be enforced before the command leaves the client.
- **shell (uid 2000):** the ADB shell user. Broad READ access (`getprop`,
  `dumpsys`, `pm list`, `logcat`) plus shell-held WRITE capabilities
  (`settings put`, `pm disable-user`, `am force-stop`, `input`, …). It
  still cannot read other apps' private `/data/data/...` directories —
  that is the AOSP sandbox boundary and holds regardless of the shell
  user's extra grants. Measured round-trip ~90 ms for `id`/`ls` over
  wireless ADB on blueline (Pixel 3, Android 12, 2026-11-09 —
  `apps/rootz/docs/wireless-debugging-setup.md`).
- **app (other uid):** own sandbox only; no shell grants at all. The
  fallback keeps the bridge usable for app-internal tasks; it is not a
  device-administration tier.

## 3. Privilege persistence — reboot vs root

| event | root tier | shell tier | app tier |
| ----- | --------- | ---------- | -------- |
| **device reboot** | **survives** — `module/service.sh` re-launches the daemon late-boot; module state (incl. OTA survival) is Magisk's own mechanism (`README.md` "Install (root tier)") | **lost** — no restart path without a computer or a fresh wireless-ADB pairing/connect cycle | with the app process |
| **adbd restart** (wireless debugging toggled, `adb kill-server`, crash) | unaffected (root tier does not depend on adbd) | **enrollment trap (measured on blueline):** blueline wipes `/data/misc/adb/adb_keys` on adbd restart while system_server's `AdbDebuggingManager.mKeyMap` survives → re-pairing silently does NOT re-enroll and TLS connects fail. **Repair:** Settings → Developer options → "Revoke USB debugging authorisations" (clears BOTH stores), re-allow the USB host, re-pair (AGENTS.md rootz section) | unaffected |
| **wireless debugging toggle won't stick** | n/a | measured on blueline: `settings put global adb_wifi_enabled 1` is reverted by a SystemUI consent gate on this build — toggle in the UI (AGENTS.md rootz section) | n/a |
| **daemon killed (process only)** | relaunched by Magisk at next boot only — no in-session watchdog in v26.11.9 | manual restart (`adb shell 'nohup /data/local/tmp/rootzd …'` — README "Usage (dev, shell tier)") | n/a |

Never run the Magisk module AND the manual `/data/adb/service.d/rootzd.sh`
install together — the second bind to 127.0.0.1:7357 collides
(`README.md`, `module/service.sh` header).

## 4. Transports are tier-independent

- **Relay tunnel — PRIMARY since v26.11.9.** Outbound
  `wss://relay.rootmyandroid.com/tunnel?device=<device_id>`; account
  pairing once per account (`POST /v1/relay/devices`), challenge
  (`POST /v1/relay/challenge`) + first-message Ed25519 auth per dial-out;
  E2E-encrypted client sessions (X25519 ephemeral → HKDF-SHA256 →
  ChaCha20-Poly1305 — `docs/e2e-protocol.md`). The relay path is
  **identical for all tiers** (AGENTS.md "Rootz daemon (live)").
- **Local listener — fallback/dev only:** 127.0.0.1:7357, reached from a
  host via `adb forward tcp:7357 tcp:7357`. **NO AUTH** (`src/main.rs`
  header). `ROOTZD_LAN_BIND=0.0.0.0` exposes it on the LAN: DANGEROUS for
  the same reason.
- **Client implementations today:** the web `/terminal`
  (`apps/web/src/lib/e2e.ts`) and the scriptable probe
  (`apps/rootzd/tools/e2e-probe.mjs`) speak the relay protocol; the Rootz
  APK speaks the local listener (`adb forward`) only. **The Rootz-app
  relay client is the active work item** — owner ruling 2026-11-10: test
  the relay path from the Rootz app against rootzd at shell tier on
  blueline (Pixel 3, non-root) before Guardian Angel work proceeds.

## 5. Client-side enforcement — the CommandGuard (Rootz 26.11.10)

The app's CommandGuard classifies every user-typed command at the single
send choke-point, BEFORE any transport, and regardless of tier — the
consequences of a mistake scale with the tier (§2). Risk ladder
SAFE / CAUTION / DANGEROUS / DESTRUCTIVE with a persistence time-dimension
on approvals: session-scoped for CAUTION, persisted "always" for
CAUTION/DANGEROUS, and run-only for DESTRUCTIVE — wipes are re-confirmed
every single time and never offer "Always allow". Validated on redfin
2026-11-10 at the root tier (dialog renders with command + reason; cancel
writes a closed receipt code `[guard] asked:cancelled: …` to the
scrollback).

## 6. Related canonical docs

- `docs/e2e-protocol.md` — the wire protocol (v1)
- `docs/relay-handoff.md` — relay architecture + auth
- `apps/rootz/docs/wireless-debugging-setup.md` — pairing/connect process
  + measured traps
- `README.md` (rootzd) — install (Magisk module) + dev usage
- `docs/test-devices.md` — the test-device roster
