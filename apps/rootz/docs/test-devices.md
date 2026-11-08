<!-- apps/rootz/docs/test-devices.md -->

# Test devices (verified 2026-11-04, read-only adb inspection)

Device serials intentionally omitted (public repo).

## Pixel 5

- Unrooted (`su` absent), SELinux `Enforcing`.
- Deploy target for the iOS-edition preview ONLY (owner rule 2026-10-30).

## Pixel 7 — GrapheneOS

- GrapheneOS CONFIRMED: `app.grapheneos.*` packages present (info, apps,
  setupwizard, gmscompat.*, backup.contacts, networklocation).
- Android 17, build `user/release-keys`, SELinux `Enforcing`.
- NOT rooted: no `su` in `/sbin|/system/bin|/system/xbin|/debug_ramdisk`,
  no Magisk/KernelSU/APatch packages, `ro.secure=1`, `ro.debuggable=0`.
- Bootloader: `ro.boot.flash.locked=1`, verified boot `yellow` +
  `vbmeta.device_state=locked` = re-locked with GrapheneOS's custom trust
  root. Root is never involved in a GrapheneOS install (unlock → flash →
  re-lock); GrapheneOS ships no `su` by design.
- Wireless debugging supported (Android >= 11) but off
  (`adb_wifi_enabled=0`).
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
  untested (no rooted device available).

## Consequences for apps/rootz

- NO rooted physical test device exists. Root tier + `service.d`
  persistence are untestable until one of: (a) Pixel 7 unlock+wipe+Magisk
  (loses GrapheneOS verified boot), (b) Pixel 5 Magisk (standard path, but
  it's the preview deploy target), (c) emulator AVD (non-Play image
  supports `adb root` → uid 0, disposable) — needs SDK on a runner.
