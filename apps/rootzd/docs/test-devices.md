<!-- apps/rootzd/docs/test-devices.md -->

# Test devices (updated 2026-11-09; read-only adb inspection unless noted)

Device serials intentionally omitted (public repo). WiFi credentials are
NEVER recorded here (rule 3a).

## Device-role matrix (owner rulings 2026-11-09)

| Device | Role | Bootloader | Notes |
| ------ | ---- | ---------- | ----- |
| Pixel 5 (redfin) | Root-tier rig + preview deploy target | UNLOCKED, Magisk v31.1 | rootzd lives here |
| Pixel 3 | **No-wipe tier** verification (Rootz APK) | NEVER UNLOCKED — keep it that way | inspected 2026-11-09 (see section below) |
| Pixel 7 | **GrapheneOS trials** | Locked w/ GrapheneOS trust root | see section below |

## Pixel 5 (redfin) — ROOTED

- Magisk v31.1 on UP1A.231105.001.B2; root canon: `su -c id` → uid=0,
  `u:r:magisk:s0`. Full run: `redfin-unlock-session.md` (RS-01..RS-45).
- rootzd (v26.11.8) deployed as the Magisk module `rootzd`
  (`/data/adb/modules/rootzd/`; the manual `service.d` install was RETIRED
  RS-44 — module supersedes); reboot persistence VERIFIED (RS-41/42, RS-44).
- Shell tier (uid 2000, `u:r:shell:s0`) verified over USB adb AND over a
  legacy wireless-ADB channel (`adb tcpip 5555`, 2026-11-09): the daemon
  start mechanics are transport-independent — the APK's later in-app
  TLS-pairing flow (Android 11+ wireless debugging) reuses the same
  start command; only the transport differs.
- Deploy target for the iOS-edition preview ONLY (owner rule 2026-10-30).

## Pixel 3 — no-wipe tier device (NEVER unlocked)

- Owner ruling 2026-11-09: this device is the verification target for the
  Rootz APK tier (wireless-debugging start, shell uid 2000) and must
  NEVER be bootloader-unlocked — an unlock would invalidate the matrix.
- First-touch preflight (2026-11-09, serial `8CHX1PEQ1`, read-only —
  Phase A of the device-unlock skill):
  - `ro.build.fingerprint` = `google/blueline/blueline:12/SP1A.210812.016.C2/8618562:user/release-keys`
  - codename `blueline` (standard Pixel 3, NOT the XL), user build, Android 12,
    security patch 2021-10-05, bootloader `b1c1-0.4-7617406`
  - `ro.boot.flash.locked=1` ✔ (locked, as the role requires); slot `_a`,
    A/B = true, apex updatable = true, abi `arm64-v8a`
  - `sys.oem_unlock_allowed=1` (factory-unlocked carrier flag — does NOT
    affect the role; the flash lock stays 1)
  - root probes: `adb root` refused ("cannot run as root in production
    builds"), `su` not found ✔ — clean no-root baseline
  - Android 12 ≥ 11 → AOSP wireless-debugging architecture applies
    (`_adb-tls-pairing` / `_adb-tls-connect`, docs/dev/adb_wifi.md) ✔

## Pixel 7 — GrapheneOS trials

- GrapheneOS CONFIRMED (2026-11-04): `app.grapheneos.*` packages present
  (info, apps, setupwizard, gmscompat.*, backup.contacts,
  networklocation).
- Android 17, build `user/release-keys`, SELinux `Enforcing`.
- NOT rooted: no `su` in `/sbin|/system/bin|/system/xbin|/debug_ramdisk`,
  no Magisk/KernelSU/APatch packages, `ro.secure=1`, `ro.debuggable=0`.
- Bootloader: `ro.boot.flash.locked=1`, verified boot `yellow` +
  `vbmeta.device_state=locked` = re-locked with GrapheneOS's custom trust
  root. Root is never involved in a GrapheneOS install (unlock → flash →
  re-lock); GrapheneOS ships no `su` by design.
- Wireless debugging supported (Android >= 11) but off
  (`adb_wifi_enabled=0`) as of the 2026-11-04 inspection.
- Re-root path: `fastboot flashing unlock` = MANDATORY full userdata wipe
  (anti-theft). Back up FIRST: Seedvault built in (partial fidelity — apps
  can opt out; full-fidelity backup needs root). Rooted GrapheneOS cannot
  re-lock under GrapheneOS keys (self-signed builds only — needs
  authoritative citation, see CONFIDENCE list in README/handoff).

## Camera evidence (Pixel 7, shell uid 2000)

- `/dev/video*` nodes: `crw-rw----` owned by `mediacodec:mediadrm` or
  `system:system`, SELinux `u:object_r:video_device:s0` → DAC-denied for
  the shell user. `cameraserver` service mediates all camera access.
- CONCLUSION: a native (non-app) process at shell tier CANNOT capture
  camera. Capture MUST run through an app (CameraX) — product gate:
  `view_camera_video` (Guardian Angel Elite, HANDOFF.md §10.2). Root tier
  NOW testable on redfin (was: no rooted device available).

## Consequences for the product tiers

- **Root tier**: redfin is the proven rig. rootzd persists via service.d
  (Magisk v31.1); other root methods (KernelSU/APatch) untested.
- **No-wipe tier**: Pixel 3 (never unlocked) is the matrix device;
  redfin's shell tier is a valid proxy for daemon mechanics but cannot
  prove the locked-bootloader customer experience.
- **GrapheneOS**: Pixel 7 — OEM-unlockable, re-lockable, no carrier
  variants; separate product track (trials only for now).
