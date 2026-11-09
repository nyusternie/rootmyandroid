<!-- apps/rootz/docs/redfin-unlock-session.md -->

# Redfin Unlock Session — Real-World Run Log (UI Requirements Source)

Status: ROOT VERIFIED + ROOTZD DAEMON VERIFIED (shell+root tiers, reboot persistence) — log covers RS-01 through RS-44 (daemon renamed rootz->rootzd per owner ruling 2026-11-08 and re-verified end-to-end) (`su -c id` → `uid=0(root) gid=0(root) groups=0(root) context=u:r:magisk:s0`, Magisk 31.1 daemon-confirmed; zero wipes beyond the initial unlock, zero user taps for the grant)
Date(s): 2026-11-05 → 2026-11-08 (multi-session run)
Audience: Root My Android / Rootz engineers building the AI-assisted unlocking UI
Purpose: chronicle EVERY step of the first real root run — including every
hurdle, its resolution, and every moment the user was required — as the binding
specification for the future guided-unlock product experience.

This log is FACT. Every entry cites observed command output or a dated upstream
observation. Where the UI must guess-proof a step, the hurdle registry says how.

## Device under test

| Field | Value |
| --- | --- |
| Codename | `redfin` (Pixel 5) |
| Serial | `…0648` (last 4; sacrificial test device) |
| SoC | SD765G, arm64, A/B slots (2), active `_b` |
| Build (pre AND post-root) | `google/redfin/redfin:14/UP1A.231105.001.B2/11260668:user/release-keys` |
| SPL | 2023-11-05 (page release date 2024-02) |
| Pre-run state | `flash.locked=1`, `oem_unlock_allowed=1`, stock unrooted |
| Staging dir | `/Workspace/hos/bootimg-library/redfin/UP1A.231105.001.B2/` (outside repo) |

## UI design principles established by this run

1. The agent performs every scriptable action. The user is prompted ONLY when
   the platform physically demands on-device interaction (bootloader warning
   screen, Developer Options toggles, RSA authorization, screen unlock,
   in-app patching until CLI automation is validated).
2. Every user prompt states WHY the user is needed and exactly what to do.
   (Copy deck below.)
3. Every step has expected output, observed output, and a recovery path.
4. Nothing is guessed: unknown values stay `unknown`; failures surface as
   structured hurdles with mitigations, never as silent retries.

## Step log

| # | Actor | Action | Observed | Hurdle / resolution |
| --- | --- | --- | --- | --- |
| RS-01 | agent | `adb devices` + `getprop` pre-flight (fingerprint, build, SPL, slot, AVB, flash.locked) | All values captured; `flash.locked=1` | none |
| RS-02 | agent | `adb shell su -c id` / `adb root` probe | refused: user build, adbd cannot run as root | H-01: expected on stock; root requires unlock path |
| RS-03 | agent | Bootloader-unlock warnings presented (wipe, AVB banner, warranty) | owner acknowledged in chat | none |
| RS-04 | agent | `adb reboot bootloader` → `fastboot getvar` (product, unlocked, slot-count, current-slot, serialno) | `unlocked:no`, `current-slot: b` | none |
| RS-05 | agent+USER | `fastboot flashing unlock` | device showed bootloader-unlock warning screen | H-02 → PROMPT P-01: volume keys navigate, power confirms; unlock performs factory wipe + auto-reboot |
| RS-06 | agent | post-wipe boot wait | device boots into setup wizard (~25–40 s) | none |
| RS-07 | USER | setup wizard: Google sign-in attempted | "Couldn't open browser" — 2SV enrolled on account | H-03 → PROMPT P-02: SKIP sign-in (offline setup); wizard re-runs on any future re-flash/wipe |
| RS-08 | USER | Developer Options: build number ×7 → OEM unlocking + USB debugging ON | toggles set | H-04 → PROMPT P-03: required after every wipe; RSA host re-authorization PROMPT P-04 on next USB connect ("Always allow") |
| RS-09 | agent | state re-verify from Android side | fingerprint unchanged; `ro.boot.flash.locked=0` (unlock confirmed); slot `_b` | none |
| RS-10 | agent | fetch stock boot.img: `curl https://developers.google.com/android/images` | 75 KB JS shell, ZERO device rows (also with Googlebot UA) | H-05: devsite tables are JS-rendered |
| RS-11 | USER | asked to read the page in own browser | page showed nav + "Acknowledge…" checkbox but NO rows | H-06: downloads gated behind ToS acknowledgment AND JS |
| RS-12 | agent | tried Google-operated mirror `https://developers.google.cn/android/images` | 193 redfin matches, FULL static tables (Chinese locale) | RESOLUTION for H-05/H-06: same publisher, trust chain intact; B2 row + SHA-256 extracted; cross-check: filename hash prefix `4e5a2679` == sha256 prefix |
| RS-13 | agent | `curl` factory zip from `dl.google.com` | 2,477,429,231 bytes; sha256 EXACT match | none |
| RS-14 | agent | `unzip "image-redfin-*.zip"` | "filename not matched" | H-08: inner image zip is nested one directory deep (`redfin-*/image-redfin-*.zip`); corrected glob |
| RS-15 | agent | extract `boot.img` | 100,663,296 bytes, valid Android bootimg, sha256 `e2ce2f17…` | none; `source.json` library record written |
| RS-16 | agent | `curl` TWRP image direct from `dl.twrp.me` | 226-byte HTML interstitial, NOT the image | H-07: direct download is JS-gated |
| RS-17 | agent | retry TWRP with browser UA + `Referer` header | real 100,663,296-byte Android bootimg; sha256 EXACT match vs published sidecar | RESOLUTION for H-07 |
| RS-18 | agent | push stock boot.img to `/sdcard/Download/boot-stock-b2.img` | exit 0 (later invalidated — see RS-22) | H-09-adjacent: storage state was not durable |
| RS-19 | agent | `adb reboot bootloader` → `fastboot boot twrp-…img` (RAM-boot, read-only) | `OKAY`, TWRP adbd enumerates as state `recovery` at ~20 s | none |
| RS-20 | agent | TWRP root shell: `id` | `uid=0(root) … context=u:r:su:s0` — first root on device | H-11 avoided by design: `/sdcard` in TWRP depends on /data decryption (UNTESTED on A14) → dump staged in `/tmp` tmpfs instead |
| RS-21 | agent | `dd if=/dev/block/by-name/boot_b` → `adb pull` → sha256 | 96 MiB copied; dump sha256 == Google-zip sha256 (`e2ce2f17…`) | CROSS-CHECK PASS: two independent sources, identical bytes |
| RS-22 | agent | `adb reboot` → `adb install Magisk-v31.1.apk` | 1st attempt: output truncated, package ABSENT; 2nd attempt: `Success`, `versionName=31.1` | H-09: install raced boot completion; mitigation: wait for full boot + ALWAYS verify via `pm list packages` |
| RS-23 | agent | check `/sdcard` for re-push | `/sdcard/` does not exist | H-10: FBE — emulated storage mounts only after FIRST screen-unlock following a boot; provisioned=1/encrypted confirmed → PROMPT P-05 (unlock screen once) |

| RS-24 | agent | re-push stock boot.img; on-device CLI patch: APK assets extracted (`magiskboot`, `magiskinit`, `magisk`, `init-ld`, `magiskpolicy`, `busybox`), `./busybox ash boot_patch.sh boot.img` (KEEPVERITY/KEEPFORCEENCRYPT=true, PATCHVBMETAFLAG/RECOVERYMODE=false) | attempt 1 FAILED (`init-ld` + `magisk` missing); attempt 2: `new-boot.img` produced, sha256 `df97c699…` | H-12 RESOLVED: patch step is FULLY SCRIPTABLE, zero user taps; mitigation: extract ALL libs from APK, not a subset |
| RS-25 | agent | pull patched img to library; `fastboot flash boot` → `fastboot reboot` | `Writing 'boot_b' OKAY`; BOOTED + boot_completed at 35 s; slot `_b`; fingerprint B2 | none |
| RS-26 | agent | canon verify `su -c id` | `su: inaccessible or not found`; `magiskd` RUNNING as root; no `su` in `/system/bin`, `/sbin`, `/vendor`; explicit `/debug_ramdisk/su` = Permission denied | H-13: `su` shim not materialized until the Magisk app completes first-run environment setup → PROMPT P-06b |
| RS-27 | agent | v31.1 su-grant investigation | "Restrict root capabilities" switch = `checked=false` (ruled out); in-app Logs tab EMPTY during requests; `/proc/net/unix` shows magiskd socket LISTEN + one CONNECTED peer | suspects narrowed to app-response path |
| RS-28 | agent | v31.1 APK manifest analysis (binary-XML string pool, UTF-16) | components: App, JobService, Provider, Receiver, Service, MainActivity ONLY — **NO SuRequest component**; Receiver handles housekeeping intents only; **NO `SYSTEM_ALERT_WINDOW` declared** | overlay-prompt hypothesis dead |
| RS-29 | agent | app-PID logcat during pending `su` request | zero exceptions; `onServiceConnected` logged at app launch (root-service bind works); app never reacts to requests | delivery-response hypothesis dead |
| RS-30 | agent | SELinux audit during pending request | ZERO `avc: denied` lines | IPC-block hypothesis dead |
| RS-31 | agent | pivot to Magisk v30.7 (latest v30.x = v30.7, GitHub releases API); CLI patch recipe v2 | v30.7 manifest CONTAINS `ui.surequest.SuRequestActivity`; `boot_patch.sh` requires `stub.apk`→`stub.xz` via magiskboot's own compress (silently continues when missing → host-`xz` stub.xz sufficed, verified byte-identical after decompress); patched+flashed+booted OK (`new-boot.img` sha256 `3bf28cd6…`) | H-16 documented |
| RS-32 | agent | v30.7 app install (downgrade `-d` over v31.1, then fresh) | BOTH times: "Success" then package SELF-REMOVED within ~90 s; logcat actor = **magiskd itself**: `pkg: APK signature mismatch: /data/app/…/base.apk` → `pm_uninstall` → attempted stub install `pm_install: /data/stub.apk` → FAILED to parse → `pm_uninstall: Success` | H-15: v30.7 pair unusable in presence of v31.1-era `/data/adb` state |
| RS-33 | agent | cert forensics (host + on-device ramdisk inspection via shell-run magiskboot) | v31.1 and v30.7 APKs signed by IDENTICAL cert (`CN=John Wu`, SHA256 `B4:CB:83:B4:…`); v30.7-patched ramdisk `overlay.d/sbin/stub.xz` decompresses to official stub bytes (sha256 `f0230e08…` == expected) | "signature mismatch" is NOT cert-content; residual hypothesis: v31.1-format daemon state chokes v30.7 daemon — UNVERIFIED, deliberately left unwiped (owner directive: fix, don't wipe) |
| RS-34 | agent | TWRP FBE decrypt attempt (root path to `/data/adb` DB seeding) | `twrp decrypt default_password` HUNG the recovery adb (90 s timeout, no output); hard-rebooted | catalog: TWRP 3.7.0_11-0 redfin A14 FBE decrypt = NON-FUNCTIONAL |
| RS-35 | agent | **v31.1 SOURCE REVIEW** (daemon.rs, db.rs, connect.rs, Provider.kt, SuCallbackHandler.kt, SuperuserGrantViewModel.kt @ tag v31.1) | v31.1 has **NO daemon-side interactive prompt at all**: on `su` request the daemon only SELECTs `policies(uid,policy,logging,notification,until)` and rejects if not Allow; the ~12 s delay = `notify_app` shelling out `content call …provider` whose methods are **log/notify TOASTS ONLY** (SuCallbackHandler); the manager app itself gets silent root (`to_app_id(uid)==to_app_id(mgr_uid)` → allow); the grant UX is a **MANUAL PICKER**: Superuser tab FAB → SuperuserGrantScreen lists ALL apps incl. first-class Shell (`SHELL_PACKAGE="com.android.shell"`, `SHELL_UID=2000`) → grant-on-select writes the policy via the app's OWN root PolicyDao | H-14 root-caused; FIX designed: drive the picker by uiautomator, zero user taps, zero wipe |
| RS-36 | agent | execute the fix: app → Superuser tab → tap FAB (bounds `[882,1900][1036,2054]`) → picker shows "Shell / SharedUID / com.android.shell" → tap row (`[33,522][1047,720]`) → `checked="true"` | policy written ON SELECT (no confirm step); screen then showed filter captions ("Show system apps"/"Show core apps") — cosmetic | grant complete |
| RS-37 | agent | CANON VERIFY | `su -c id` → **`uid=0(root) gid=0(root) groups=0(root) context=u:r:magisk:s0`** ✔; `su -c "magisk -v"` → `31.1:MAGISK:R`; `su -c "magisk --sqlite …"` → `uid=2000\|policy=2\|until=0\|logging=1\|notification=1` (policy 2 = Allow, permanent) | ROOT VERIFIED — run goal achieved |
| RS-38 | agent | rootz daemon root-tier retest prep | **com.rootmyandroid (rooted daemon app) found UNINSTALLED** (present and working 19:36; absent 23:04); actor NOT captured (logcat rotated); both vanished apps were adb-sideloaded; Play-Protect-class auto-removal is the primary suspect [ERRATUM — see RS-39: the vanished package was the RN Android-edition app `com.rootmyandroid`, NOT the rootz daemon, which is a root-installed binary and needs no APK; "rebuild required" was wrong — `dist/` binary was current] | H-17 documented — PRODUCT REQUIREMENT: distribution/onboarding must handle sideload-removal risk |
| RS-39 | owner+agent | plan verification: does rootz need an APK? | NO — plan never changed: `apps/rootz/README.md` ("installed on rooted devices, not distributed as an APK", owner ruling 2026-11-07) + HANDOFF §13 ("Rootz is the DAEMON, not the app") + `main.rs` tiers (root via su / shell via adb / app-embedded fallback). `apps/` contains android, guardian, ios, rootz, web — no `apps/rooted`. Agent erratum: earlier session-summary described `/api/*` endpoints on port 9192 — main.rs v0.1 implements a raw sh bridge on 7357 only; treat 9192-API claims as misremembered. `dist/rootz-aarch64-linux-android` (built 20:38, postdates main.rs 20:31) = current; NO rebuild needed |
| RS-40 | agent | rootz tier verification on redfin | pushed dist binary → device sha256 == host ✔; SHELL tier (adb nohup start, forward 7357, `nc`→`id`): `uid=2000(shell) … u:r:shell:s0` ✔; ROOT tier (`su -c` start): **`uid=0(root) gid=0(root) groups=0(root) u:r:magisk:s0`** ✔ — both tiers of main.rs v0.1 confirmed on-device |
| RS-41 | agent | root-tier persistence (main.rs TODO "persistable (service.d) — verify per root method") | installed `/data/adb/rootz/rootz` (root:root 0755) + `/data/adb/service.d/rootz.sh` (nohup bootstrap) → FULL REBOOT → zero manual start → `nc 7357`→`id`: **`uid=0(root) … u:r:magisk:s0`** ✔ = service.d persistence VERIFIED for Magisk v31.1/redfin; post-reboot: Magisk package alive, root canon re-verified, staging cleaned (only intended `boot-stock-b2.img` left in Downloads) |
| RS-42 | owner+agent | daemon rebrand executed: rootz -> rootzd (Rootz brand moves to the future no-wipe APK product; daemon takes d-suffix; Rootz PRO ruled to span BOTH products) | repo-wide rename (`apps/rootz`->`apps/rootzd`, `scripts/build-rootzd-remote.sh`, Cargo pkg, main.rs strings, env vars `ROOTZD_*`); runner build OK (`rootzd-aarch64-linux-android`, sha256 `1cca2211…`); device swap: `/data/adb/rootzd/rootzd` + `service.d/rootzd.sh`, old rootz install retired; immediate `nc` id = `uid=0 … u:r:magisk:s0` ✔; FULL REBOOT zero-touch persist re-verified ✔ (`pidof rootzd` = 1786) |
| RS-43 | owner+agent | **wireless-ADB smoke test (shell tier, no USB data path)** — the rootz no-wipe tier proof | (1) device joined the new owner LAN (old SSID gone; creds NOT recorded, rule 3a), IP 192.168.4.35 vs host 192.168.4.31 — same /22. (2) `adb tcpip 5555` + `adb connect` → wireless channel live. (3) root-tier rootzd killed; shell-tier started from `/data/local/tmp/rootzd` OVER wireless; `adb forward tcp:7358` → `nc` answered `uid=2000(shell) ... context=u:r:shell:s0` — **daemon start mechanics are transport-independent** (APK v0.2 in-app TLS pairing reuses the same start command; only the transport differs). (4) cleanup: forward removed, shell-tier killed, `adb disconnect`, `adb usb` (port 5555 verified CLOSED — LAN exposure window ended), root-tier rootzd restored via USB `su` → `uid=0(root) ... u:r:magisk:s0` — production state fully restored |
| RS-44 | owner+agent | **Magisk module zip path (Option B) approved, built, installed, verified** | `apps/rootzd/module/` (module.prop / service.sh / customize.sh w/ arm64 guard + exec-bit fix) + `scripts/package-rootzd-module.sh` → `dist/rootzd-magisk-module-v0.1.0.zip` (165,583 B). On device: retired `/data/adb/service.d/rootzd.sh` + killed running daemon (module SUPERSEDES the manual install — double-start would collide on :7357); `su -c 'magisk --install-module …'` OK (banner parsed module.prop; landed pending in `modules_update/`); REBOOT finalized it → `modules/rootzd/` = {module.prop, rootzd, service.sh}, `modules_update/` + `service.d/` both empty, `pidof rootzd` = 1478 (module's service.sh started it), `nc` id = `uid=0(root) ... u:r:magisk:s0` ✔ |

Pending: canon verify (post P-06b) → Phase D checklist → Rootz root-tier daemon test (RS-27).

## Hurdles registry

| ID | Hurdle | Severity | UI mitigation |
| --- | --- | --- | --- |
| H-01 | `adbd root` refused on user builds | expected | never attempt; root plan always goes through unlock/patch path |
| H-02 | Bootloader unlock wipes device + needs on-screen confirmation | blocking, destructive | P-01 prompt; pre-unlock backup advisory; wipe consequence stated verbatim |
| H-03 | Google sign-in blocked by 2SV ("Couldn't open browser") | blocking | P-02: skip sign-in; proceed offline; account concerns deferred post-root |
| H-04 | Developer Options + toggles must be re-enabled after every wipe; RSA key re-authorized | blocking | P-03/P-04 prompts with exact tap path |
| H-05 | `developers.google.com/android/images` is JS-rendered (no static rows) | blocking for automation | use `developers.google.cn` mirror (Google-operated) for machine reads; verify filename-hash-prefix == sha256-prefix |
| H-06 | Page downloads gated behind ToS acknowledgment + JS | blocking for user-driven reads | mirror (H-05); if user reads page: instruct "click Acknowledge first" |
| H-07 | TWRP direct download is interstitial-gated | blocking for automation | fetch with browser UA + Referer; verify vs published sha256 sidecar; NEVER trust unverified bytes |
| H-08 | Factory inner zip nested one directory deep | trivial | glob `*/image-redfin-*.zip` |
| H-09 | `adb install` racing boot completes "successfully silent" | dangerous | gate installs on `sys.boot_completed=1`; ALWAYS verify package presence + version after install |
| H-10 | FBE: `/sdcard` absent until first post-boot screen unlock | blocking | P-05 prompt; check `mount` state before pushing |
| H-11 | TWRP `/sdcard` unusable without /data decryption (A14 untested) | avoided | stage recovery-side scratch files in `/tmp` tmpfs |
| H-12 | Magisk patching via app UI requires user taps | UX debt | RESOLVED at RS-24: on-device `magiskboot` CLI patching from APK assets is fully scriptable (zero user taps); P-06 prompt retired as fallback-only |
| H-13 | After flashing patched boot, `su` not exposed to shell/apps until Magisk app first-run completes environment setup | blocking | P-06b prompt (open app once; accept additional setup; expect one reboot) — RESOLVED at RS-27 prep; then H-14 applies |
| H-14 | Magisk v31.1 removed the daemon-side grant prompt entirely: unknown-uid `su` requests are auto-rejected (~12 s `notify_app` toast-call delay) and the ONLY grant path is the app's manual picker (Superuser tab FAB → Grant Superuser → select app) | blocking | RESOLVED at RS-35/36: uiautomator drives the picker (FAB → select Shell row → grant-on-select, no confirm); zero user taps. Fallback P-07 if geometry breaks on other devices |
| H-15 | Magisk v30.7 daemon auto-uninstalls its own manager app citing `APK signature mismatch` DESPITE byte-verified identical cert chain (app + embedded stub both official); occurs only with v31.1-era `/data/adb` leftovers present | blocking (v30.7 path) | do NOT version-hop between major Magisk releases without clean `/data/adb`; on redfin stay on v31.1 + H-14 fix; root cause UNVERIFIED (left unwiped per owner directive) |
| H-16 | v30.x `boot_patch.sh` needs `stub.apk` (v31.x does not); its compress step fails SILENTLY (no abort), so a host-made `xz` of the stub works — verify ramdisk `overlay.d/sbin/stub.xz` decompresses to official bytes after patching | tooling | patch recipe must extract `assets/stub.apk` named `stub.apk` + verify ramdisk contents (recipe v2 in RS-31/33) |
| H-17 | adb-sideloaded packages (the RN Android-edition app `com.rootmyandroid`; possibly Magisk) can be PHANTOM-UNINSTALLED on stock Pixel ~hours after install; actor unconfirmed (log rotated), Play-Protect-class auto-removal primary suspect | product | after every install: `pm list packages` verify AND re-verify before dependent steps; onboarding must warn users about Play Protect removing sideloaded apps; long-term fix = Play-Store distribution of the RN apps. NOTE (RS-39): the rootz daemon is a root-installed BINARY in /data/adb, not a package — immune to package-level removal; this hurdle does NOT apply to it |

## User-prompt copy deck

- **P-01 Bootloader unlock (device screen):** "Your phone now shows the unlock
  warning. This step ERASES EVERYTHING on the phone. Use volume keys to select
  UNLOCK, press power to confirm. The phone wipes and reboots itself."
- **P-02 Skip sign-in:** "Google sign-in failed (2-step verification). Tap SKIP
  — we finish setup offline. You can sign in after rooting; the wizard re-runs
  on any future reset."
- **P-03 Developer Options:** "Tap Settings → About phone → Build number 7
  times, then Settings → System → Developer options → enable OEM unlocking and
  USB debugging. Wipes reset these; they are required to continue."
- **P-04 Authorize this computer:** "Tap 'Always allow from this computer' → OK
  on the USB debugging prompt. The wipe made the phone forget this computer."
- **P-05 Unlock screen:** "Unlock your phone screen once. Until the first
  unlock after a boot, Android keeps your files area unmounted (encryption),
  and we cannot stage the boot image."
- **P-06b Magisk first-run:** "Open the Magisk app once. If it says
  'Requires Additional Setup', tap OK — the phone may reboot one final time.
  This finishes installing the root manager that the patched boot image
  expects to find."
- **P-06 Magisk patch (FALLBACK ONLY — retired 2026-11-08 by RS-24):** "Open the Magisk app →
  Install → 'Select and Patch a File' → choose boot-stock-b2.img → LET'S GO.
  Patching is cryptographic repacking of YOUR boot image; it must run on the
  phone."
- **P-07 Grant Shell root (FALLBACK ONLY — normally fully automated per RS-36):**
  "Open Magisk → Superuser tab → tap the round + button (bottom right) → tap
  'Shell' (com.android.shell) so its check turns on. Magisk 31.x grants the
  moment you select it — no further confirmation. This lets our computer-based
  tooling verify the root succeeded."

## Session-level notes for the catalog

- redfin unlock flow = `fastboot_unlock` (no device-specific codes) per
  `device-unlock-template.md`; root method `magisk_boot` (RAM-boot TWRP used
  only as a read-only dump tool; nothing flashed from TWRP).
- TWRP 3.7.0_11-0 on Android 14: boots fine for RAW partition access; /data
  FBE decryption NON-FUNCTIONAL (manual `twrp decrypt default_password` hung
  recovery adb, RS-34). Never route a procedure through TWRP-/data on this
  pairing.
- End-of-life device (last update 2024-02): future OTA breakage risk = none.
- Magisk v31.1 architecture (verified from source @ v31.1): no daemon prompt;
  provider methods = log/notify only; DB schema `policies(uid,policy,until,
  logging,notification)`, policy 2 = Allow; manager app silently rooted;
  grant = manual picker, grant-on-select. Picker geometry captured on redfin
  (FAB `[882,1900][1036,2054]`, Shell row `[33,522][1047,720]`) — RE-DERIVE
  per device/locale; never assume geometry ports.
- Magisk v30.7 anomaly (H-15): self-uninstall of manager despite verified cert
  chain. Catalog as observed defect with log excerpts; root cause open.
- Sideload phantom-uninstall (H-17): actor open; mitigation = verify installs
  at dependent steps + Play-Store distribution long-term.
