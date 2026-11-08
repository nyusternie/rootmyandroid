---
name: device-unlock
description: Guided bootloader-unlock + Magisk root pipeline for physical Android devices over adb/fastboot. Use for ANY device unlock, root, boot-image, or device-catalog task — preflight evidence capture, verified artifact staging, scripted patching, user-prompt discipline, and canon root verification. Device-agnostic general process; redfin (Pixel 5) is catalog instance #1.
---

# Device unlock + root pipeline (general)

Paths below are repo-root-relative. This skill lives at
`.agents/skills/device-unlock/` (repo root is `../../../`).

This is the GENERAL process for taking a physical Android device from stock
locked state to verified Magisk root, and recording the run so users can
confidently follow a per-model guide. Each processed device produces three
records: a session log, a completed per-model template, and a catalog entry.

## Binding rules (learned from real runs — do not relax)

1. **Hash-verify every artifact against the publisher's own published value**
   before it touches a device. Never trust unverified bytes. Cross-checks:
   Google's factory-zip filename embeds the first 8 chars of its SHA-256 —
   the filename prefix MUST equal the published checksum prefix.
2. **Nothing is guessed.** Unknown device properties stay `unknown`; detection
   rules cite observed device + date (repo AGENTS.md rule 3).
3. **Minimal user interaction.** The agent performs every scriptable step,
   including on-device UI driving. The user is prompted ONLY when the platform
   physically demands them, and every prompt states WHY (see copy deck in the
   session log).
4. **Bootloader unlock wipes the device.** State this consequence verbatim
   before every unlock. Never issue generic bootloader-RELOCK instructions
   (relocking non-stock software bricks devices).
5. **TWRP/custom recovery is a RAM-boot tool only** (`fastboot boot`, never
   `fastboot flash`) unless the per-model template explicitly approves
   flashing it. Inside recovery, stage scratch files in `/tmp` (tmpfs) —
   never assume `/sdcard` is available (decryption-dependent).
6. Repo rule 6 applies unconditionally: never wipe/clear third-party packages.
6a. **NEVER wipe to escape a root/grant problem.** A wipe is a workaround,
   not a fix, and paying customers' devices arrive in exactly these states.
   When the sanctioned path is blocked by an unknown mechanism: read the
   tool's own SOURCE (Magisk is open-source; fetch the exact version tag),
   find the write-path the tool itself uses, and drive THAT (the v31.1 grant
   picker was found this way — RS-35/36).
6b. **Re-verify every install immediately before dependent steps.**
   adb-sideloaded apps can be phantom-uninstalled on stock Pixel hours later
   (hurdle H-17). `pm list packages` is cheap; silent absence is not.
7. Keep binaries OUT of the public repo. Verified boot images live in the
   private library (`/Workspace/hos/bootimg-library/<codename>/<BUILD>/`)
   with a `source.json` provenance record; only metadata and docs are
   committed. Google factory-image licenses forbid redistribution.

## Pipeline phases

### Phase A — Preflight (agent, read-only)
- `adb devices` → `getprop`: `ro.build.fingerprint`, `ro.product.device`,
  `ro.build.version.security_patch`, `ro.boot.flash.locked`,
  `ro.boot.slot_suffix`, `ro.product.cpu.abi`, `ro.build.ab_update`,
  `ro.apex.updatable`, `sys.oem_unlock_allowed`.
- Probe `adb root` / `su` — refusal is EXPECTED on `user` builds.
- Record all values into the session log and template BEFORE any state change.

### Phase B — Bootloader unlock (agent + ONE user prompt)
- `adb reboot bootloader` → `fastboot getvar product version-unlocked
  current-slot slot-count serialno`.
- `fastboot flashing unlock` → USER PROMPT P-01 (device shows the standard
  warning screen; volume keys navigate, power confirms; device wipes and
  reboots itself). Warn about the wipe verbatim first.
- Post-wipe: USER PROMPTS only where the platform forces them —
  P-02 skip Google sign-in (2SV blocks browser sign-in; offline setup works),
  P-03 Developer Options (build number ×7) + OEM unlocking + USB debugging,
  P-04 RSA re-authorization ("Always allow").
- Re-verify from Android: fingerprint unchanged, `ro.boot.flash.locked=0`.

### Phase C — Stock boot.img acquisition (agent)
- `developers.google.com/android/images` is JS-GATED: curl returns a shell
  with zero rows, and user browsers may show no rows until "Acknowledge" is
  clicked (hurdles H-05/H-06). MACHINE READS use the Google-operated mirror
  `https://developers.google.cn/android/images` (static tables, zh locale).
- Extract the exact-build row's SHA-256; apply the filename-prefix
  cross-check (rule 1).
- Download the factory zip from `dl.google.com` (direct, curl-friendly),
  verify SHA-256. Inner image zip is nested one directory deep — glob
  `*/image-redfin-*.zip` pattern `*/image-<codename>-*.zip` (hurdle H-08).
- Extract `boot.img`, record SHA-256 + `source.json`.
- TWRP (if needed for cross-verification): direct download is
  interstitial-gated — fetch with a browser UA AND `Referer` header
  (hurdle H-07); verify against the published `.sha256` sidecar.

### Phase D — Cross-verification (agent, strong proof)
- RAM-boot TWRP → root shell (`uid=0 context=u:r:su:s0`) →
  `dd if=/dev/block/by-name/boot_<slot> of=/tmp/dump.img` → `adb pull` →
  SHA-256 MUST equal the Google-extracted `boot.img`. Two independent
  sources producing identical bytes is a hard integrity proof of both the
  device state and the library artifact.
- Reboot to Android (`adb reboot`); boot partition was read-only touched.

### Phase E — Scripted patch (agent, ZERO user taps)
- `adb install` is race-prone right after boot: gate on
  `sys.boot_completed=1`, then ALWAYS verify via `pm list packages` +
  `dumpsys package <pkg> | grep versionName` (hurdle H-09).
- On-device CLI patching replaces the Magisk-app patch UI (hurdle H-12,
  RESOLVED): extract from the release APK (`unzip -j`): `assets/boot_patch.sh`,
  `assets/util_functions.sh`, and ALL of `lib/<abi>/libmagiskboot.so`,
  `libmagiskinit.so`, `libmagisk.so`, `libinit-ld.so`, `libbusybox.so`,
  `libmagiskpolicy.so` — renamed to `magiskboot magiskinit magisk init-ld
  busybox magiskpolicy`, `chmod 755`. Omitting ANY of them fails patching
  mid-run with `No such file or directory`.
- Push to `/data/local/tmp/rma-patch/`, copy stock `boot.img` there, run:
  `KEEPVERITY=true KEEPFORCEENCRYPT=true PATCHVBMETAFLAG=false
  RECOVERYMODE=false ./busybox ash boot_patch.sh boot.img`
  (RECOVERYMODE=false for A/B devices without a dedicated recovery
  partition; verify per-model in the template).
- Output `new-boot.img` → pull to library as `magisk_patched-<build>.img`,
  record SHA-256.
- FBE caveat (hurdle H-10): `/sdcard` does not exist until the first screen
  unlock after every boot. If pushes fail with `secure_mkdirs failed`,
  prompt the user to unlock the screen ONCE (P-05) — provisioned=1 +
  encrypted + no sdcard mount confirms the diagnosis.

### Phase F — Flash + canon verify (agent, one user tap may survive)
- `adb reboot bootloader` → `fastboot flash boot magisk_patched-<build>.img`
  (flashes the ACTIVE slot — confirm `current-slot` matches the dumped slot)
  → `fastboot reboot` → wait for `sys.boot_completed=1` AND fresh `uptime`.
- Canon verify: `adb shell 'su -c id'` → MUST return
  `uid=0(root) gid=0(root) ... context=u:r:magisk:s0`.
- Post-flash platform behaviors (hurdle H-13, redfin instance): the Magisk
  app must complete a one-time "Requires additional setup" + reboot before
  `su` exists at all; agent drives this via UI automation (below).
- **Granting Shell root (Magisk v31.x canon, zero user taps):** v31.x
  removed the daemon-side prompt — unknown-uid requests auto-reject. Drive
  the app's manual picker by uiautomator: Superuser tab → round FAB
  (bottom-right, above nav) → Grant Superuser picker → tap the
  "Shell / com.android.shell" row → `checked=true` = granted ON SELECT (no
  confirm). Verify via `su -c id`, then record the policy row:
  `su -c 'magisk --sqlite "SELECT uid,policy,until,logging,notification FROM
  policies;"'` (expect `2000|2|0|1|1`). Geometry is device/locale-specific —
  RE-DERIVE per run from fresh dumps; redfin reference geometry is in the
  session log RS-36.
- **Do NOT version-hop major Magisk releases** on a device with existing
  `/data/adb` state (hurdle H-15: v30.7 daemon self-uninstalled its own
  manager despite byte-verified cert chain; root cause open, deliberately
  left unwiped).
- **Rootz daemon (`rootzd`) attach (Rootz PRO prerequisite, verified on
  redfin RS-40/41, renamed+re-verified RS-42):** the daemon is a
  root-installed BINARY, not an APK — `apps/rootzd/dist/rootzd-<target>` →
  `/data/adb/rootzd/rootzd` (root:root 0755) + `/data/adb/service.d/rootzd.sh`
  (nohup bootstrap) → reboot → verify with zero manual start:
  `adb forward tcp:7357 tcp:7357` + `nc 127.0.0.1 7357` → `id` MUST return
  uid=0/u:r:magisk:s0. Also verify sha256(device) == sha256(host dist)
  after every push. Persistence method (service.d vs Magisk module) must be
  verified per root method — service.d is verified for Magisk v31.1 on
  redfin; other methods are UNKNOWN until tested.

### Phase G — Catalog + close-out (agent)
- Complete the per-model template, append final session-log rows, update the
  `/device` catalog record (support tier, verified date, quirks), and
  extend the library `source.json`. Commit docs ONLY (rule 7).

## Agent UI-driving playbook (adb-only, no accessibility service)

- Wake + unlock swipe lockscreens: `input keyevent KEYCODE_WAKEUP` +
  `wm dismiss-keyguard` (fails silently if a PIN is set — then P-prompt).
- Launch apps: `monkey -p <pkg> -c android.intent.category.LAUNCHER 1`.
- Inspect screens: `uiautomator dump /sdcard/Download/ui.xml` → pull →
  parse `text=` and `bounds=` attributes.
- **Tap label CENTERS of nav items, not the clickable-container bounds
  naively** — and vice versa: in View-based dialogs the TEXT node and the
  CLICKABLE container can be offset by 50+ px (redfin H-13 instance: OK
  text at y 1205-1250 but the touch region at y 1262-1394). If a tap does
  nothing: (a) verify screen awake (`dumpsys power | grep mWakefulness`),
  (b) re-dump and tap the OTHER layer's bounds, (c) verify the dialog is
  still foreground (`dumpsys window | grep mCurrentFocus`).
- Detect reboots by waiting for adb DISCONNECT first, then reconnect +
  `boot_completed` + FRESH `uptime` — checking `boot_completed` alone
  false-positives on the still-running pre-reboot system.
- NEVER tap anything labeled "Uninstall"/"Complete uninstall" in Magisk —
  that menu removes root. BACK out immediately.

## Records produced per device

| Record | Location |
|---|---|
| Session log (every step, hurdle, prompt) | `apps/rootz/docs/<codename>-unlock-session.md` |

Troubleshooting discipline that produced the redfin fix: enumerate
hypotheses, kill each with the cheapest decisive probe (manifest string
pool, `/proc/net/unix`, avc grep, app-PID logcat), and when probing is
exhausted READ THE EXACT-VERSION SOURCE — the answer is always in the
tool's own write path. Catalog every anomaly with log excerpts even when
its root cause stays open (H-15, H-17).
| Per-model template (filled) | `apps/rootz/docs/device-unlock-template.md` + `<codename>` instance |
| Catalog entry | `apps/web` `/device` catalog (see catalog team docs) |
| Verified artifacts + provenance | `/Workspace/hos/bootimg-library/` (private, never committed) |

Instance #1: redfin (Pixel 5) — `apps/rootz/docs/redfin-unlock-session.md`
(hurdles H-01..H-13, prompts P-01..P-07). New instances MUST reuse the
hurdle/prompt IDs where the same phenomenon occurs and allocate new IDs
for new phenomena.
