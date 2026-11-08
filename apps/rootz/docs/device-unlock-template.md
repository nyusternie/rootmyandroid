<!-- apps/rootz/docs/device-unlock-template.md -->

# Device unlock template — verified process

Reusable runbook for unlocking + rooting a device. First VERIFIED instance:
Google Pixel 5 (`redfin`), 2026-11-07. Copy the instance-record block per
new device and fill in the observed values — never guess (repo rule 3);
unknown = "unknown".

## Instance record: Google Pixel 5 (redfin) — VERIFIED 2026-11-07

- Software: Android 14, build `UP1A.231105.001.B2`, patch 2023-11-05,
  A/B slots (active `_b`), FBE encrypted, SELinux Enforcing.
- OEM gate: `sys.oem_unlock_allowed` was `0` → user toggled Settings →
  System → Developer options → "OEM unlocking" (PIN prompt + warning) →
  prop flipped to `1`. Toggle present and functional (not carrier-greyed).
- Backup gates executed BEFORE the wipe:
  - `bmgr backupnow --all` works at shell tier; freshness verified via
    `dumpsys backup` ("Last backup pass" ≈12 min before check).
  - `du -sh /sdcard` → 0 bytes (always measure; do not assume).
  - Host manifests: `pm list packages` (372), `settings list system|secure|
    global`, `content query` for sms/calls/contacts → "No result found"
    (shell-tier provider access returns nothing here — cloud backup is the
    SMS/call-log carrier on Pixel stock).
  - TOTP/manual secrets: user confirmed none on device.
- Unlock: `adb reboot bootloader` → `fastboot devices` →
  `fastboot flashing unlock`.
  OBSERVED BEHAVIOR: host returns `OKAY` in ~0.03 s IMMEDIATELY; the device
  then shows its own prompt ("Press Volume keys to select different menu");
  the wipe executes ONLY after the user selects "Unlock the bootloader" +
  power. The device drops off USB while the prompt is up (fastboot/adb both
  blind), re-enumerates in fastboot after the wipe.
- Post-wipe verify: `fastboot getvar unlocked` → `unlocked: yes`;
  `current-slot: b`; `product: redfin`.
- First boot: orange "bootloader unlocked" warning (expected new state) →
  setup wizard → sign in same Google account → restore from today's backup
  (verify the date shown) → re-enable Developer options (build number ×7) →
  USB debugging → host re-authorization prompt on device.
- Root path (staged, pending): stock `boot.img` from the factory zip
  (checksum chains to the Google-published SHA-256) → on-device Magisk
  patch → `fastboot flash boot` → canon verify `uid=0
  context=u:r:magisk:s0`. Rollback: `fastboot flash boot <stock boot.img>`.

## General template (per new device)

1. DETECT (read-only): codename (`ro.product.device`), build fingerprint,
   security patch, slot suffix, `ro.boot.flash.locked`,
   `sys.oem_unlock_allowed`, vbmeta/verified-boot state.
2. GATE CHECKS: OEM-unlock-allowed (user-toggle instruction if `0`;
   carrier-greyed = stop), battery, cable, host `adb` + `fastboot`.
3. BACKUP: cloud pass trigger + freshness verify, `/sdcard` size + pull,
   host manifests, TOTP/manual-secrets question. (Future: Rootz cloud
   backup to R2 replaces the manual dance.)
4. EXPLICIT wipe confirmation (repo rule 6) naming device + consequence.
5. UNLOCK: reboot bootloader → enumerate → <device unlock command>.
   RECORD the confirmation-prompt behavior (host-side vs on-device gating)
   — it varies per OEM.
6. VERIFY unlock via `fastboot getvar` (or device equivalent); record slot.
7. RESTORE runbook: wizard restore (verify backup date), Developer options,
   USB debugging, host re-auth.
8. ROOT: stock `boot.img` / `init_boot.img` (checksum chains to the
   MAKER-published value) → patch → flash → canon verify
   (`uid=0 context=u:r:magisk:s0`).
   Partition note: devices LAUNCHING with Android 13+ patch `init_boot.img`;
   older devices patch `boot.img` (Magisk installation docs; redfin = boot).
   NEVER relock the bootloader after flashing a Magisk-patched image
   (verified boot rejects it); Google's "relock when done" guidance applies
   to STOCK restores only.
