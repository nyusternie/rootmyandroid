# Rootz (MVP app)

From-scratch (NO fork) minimal viable Android app: a client for the
**rootzd** daemon bridge (`127.0.0.1:7357`). Owner ruling 2026-11-09: the
Rootz brand is the no-wipe tier product; the daemon is `rootzd`
(`apps/rootzd`). Rootz PRO spans both (2026-11-08 ruling).

- Package id: `com.rootmyandroid.rootz` (owned namespace).
- v26.11.8 VERIFIED on redfin 2026-11-09 (RS-45): CI-built APK ↔
  module-installed rootzd — status `daemon: connected (tier: root)`,
  interactive `uname -a` round-trip rendered in-app.
- Plain framework UI (no appcompat/material/Compose), Kotlin 2.2.0,
  AGP 9.2.1, Gradle 9.4.1 — versions mirror the runner-proven RN shells.
- Not a pnpm workspace package (no `package.json`) — `pnpm -r` skips it,
  like `apps/rootzd`.

## v26.11.8 scope (this scaffold)

Single screen: daemon status + tier (parsed from `id`), command input,
scrollable output. One fresh TCP connection per command; `exit` closes
the piped shell. The daemon is started OUTSIDE the app.

## Start the daemon for v26.11.8 testing

Shell tier (any device with adb — no root needed):

    adb push apps/rootzd/dist/rootzd-aarch64-linux-android /data/local/tmp/rootzd
    adb shell chmod 755 /data/local/tmp/rootzd
    adb shell 'nohup /data/local/tmp/rootzd >/dev/null 2>&1 </dev/null &'

Root tier (rooted device; persists across reboots — verified on redfin):
see `apps/rootzd/README.md` + `apps/rootzd/docs/redfin-unlock-session.md`
(install at `/data/adb/rootzd/` + `/data/adb/service.d/rootzd.sh`).

Then launch the app. No `adb forward` needed — the app connects to
localhost directly.

## Build (runner only — NEVER on the local host, owner rule)

    gh workflow run rootz.yml --ref master
    gh run watch <run-id>

Release build signed with the public debug key (preview only, never
publish); published as a rolling prerelease asset `rootz-preview-apk`.

## Roadmap (approved direction)

- **pairing milestone (slice 1 shipped 26.11.8; self-start pending)** —
  in-app wireless-debugging pairing + daemon self-start
  (Android 11+; the no-computer flow). Daemon start mechanics already
  proven transport-independent (wireless-ADB smoke test, 2026-11-09).
  Slice 1 shipped + validated 2026-11-09: `AdbWifiDiscovery.kt` finds and
  resolves `_adb-tls-pairing._tcp` / `_adb-tls-connect._tcp` / `_adb._tcp`
  (logcat tag `AdbWifi`); on blueline (Pixel 3, Android 12, locked),
  toggling Wireless debugging ON surfaced `adb-8CHX1PEQ1-eNJClj` @
  192.168.4.33:43277 within seconds — matching the AOSP `adb_wifi.md`
  architecture (instance `adb-<serialno>`, random TLS port).
  Implementation note: `onServiceFound` fires per address family — dedupe
  by instance name before resolving (a duplicate resolve raced with
  `FAILURE_ALREADY_ACTIVE`).
- **binder milestone (planned)** — binder API for third-party apps under
  OUR namespace
  (`com.rootmyandroid.rootz.*` constants, HANDOFF §13 addendum); legacy
  ecosystem interop only via a separate, clearly-labeled compat companion.
