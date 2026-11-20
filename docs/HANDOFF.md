# HANDOFF — QR scanner verification + F-Droid Phase 1 (2026-11-15/16)

New agent: read §0 first. It explains why the previous session appeared to
malfunction — it did not (all builds green, all fixes verified); the host's
network is broken in a way that eats every sustained transfer, and the
failure was diagnosed ~5 hours too late.

> **UPDATE 2026-11-16 (later same day): §5 verification round COMPLETE —
> no further Pixel 5 work remains from this handoff.** 0ddbe5e fdroid APK
> installed on redfin from the release asset via the phone's own Chrome
> (on-device sha256 7aa3a1d2… match); manual-surface fix verified in
> logcat (`preview surface delivered`, frames ticking, zero 5 s stalls);
> live decode ×2 (a real pairing URL + the qr-test QR); PGM forensics
> PASS (raw 480x640 frame decodes host-side to the real pairing URL);
> appstore build restored as the daily driver (sha256 e6880a38… match).
> §8 Phases 2–4 are the open work — see FDROID-SUBMISSION-PLAN.md.
>
> **UPDATE 2026-11-16 (evening): F-Droid Phase 2 COMPLETE.** Commits
> 179791d (conditional release-signing), 9ed4c0c (committed base
> gradle.properties — clean checkouts crashed on AGP built-in-Kotlin
> collision without it), 94b38da (reproducibility flags: -ffile-prefix-map
> + --build-id=none on every CMake target). Two-path proof at 94b38da:
> 460/460 payloads byte-identical across different absolute paths,
> `apksigcopier compare --unsigned` exit 0, and the CI asset
> (sha256 a5e65a4f…c0, run 43883122607) equals the from-source build
> byte-for-byte. Cert sha256 extracted:
> 1c59c4331c9c8f1fc0e41578ef47ac404396ba7596f5a4c8e94528d4886bceca (keytool
> on blackhost; matches the recipe's AllowedAPKSigningKeys). Maintainer
> recipe draft committed: apps/android/metadata/com.rootmyandroid.yml.
> Remaining: Phase 3 leftovers (listings + screenshots — screenshots need
> the Pixel 5), Phase 4 (release + fdroiddata MR).
>
> **blackhost operational lessons (2026-11-16):** (1) 3.9 GB RAM — NEVER
> run two gradle builds concurrently, and never concurrently with a CI
> job: measured OOM-kill killed the runner service mid-job (restart with
> `systemctl restart actions.runner.nyusternie-rootmyandroid.blackhost-web.service`);
> queued runs never start while it is failed. (2) Disk ~40G runs ~92-97%
> full — a single RN build needs ~2 GB; ENOSPC failed one CI run (disk was
> 100%). Clean stale _work dirs + /tmp clones between experiments; ONE
> build at a time, always. (3) ssh sessions from the host stay flaky under
> load — detach everything with nohup and poll in bursts.

## 0. THE NETWORK TRAP — read before ANY transfer on this host

Measured 2026-11-16, host `shomari@hos` (this workstation):

- `ping -M do -s 1400 212.104.141.173` (runner, through tunnel): **100% loss**
- `ping -M do -s 1400 1.1.1.1` (DIRECT wifi, no tunnel): **100% loss**
- `ping -M do -s 100 212.104.141.173`: **50% loss, RTT ~170 ms**
- `wg0-mullvad` MTU is clamped to **1325**; wifi is `wlp58s0`
  (100.68.x/16); a wired NIC exists and is **DOWN**: `enp0s31f6`.

Interpretation: the wifi link itself is degraded (high RTT + packet loss +
small path MTU), and ALL outbound traffic — including the Mullvad tunnel
(`wg0-mullvad`, policy table `1836018789`, which carries BOTH GitHub
(185.199.x) AND the runner 212.104.141.173) — collapses on any sustained
flow. Interactive SSH commands (few small packets) sail through; HTTPS
downloads reset at ~8 MB; scp/rsync trickle at ~20-40 KB/s. This is why
"17 MB takes hours" — the file was never the problem.

**Fix the link first** (plug in ethernet / better wifi / repair the wifi
path), or avoid the host for file movement entirely. The phone and the
runner are both healthy. Do NOT debug the code because a transfer failed.

**OWNER RULING 2026-11-17: THE BROWSER-DOWNLOAD APK PATH IS RETIRED.**
No more `am start -a VIEW` + Chrome-download installs ("we cannot rely on
the very hacky browser download anymore"). The ADB path is:

- `adb push <apk> /data/local/tmp/` (USB — does NOT cross the broken wifi),
  then `pm install -r /data/local/tmp/<apk>`.
- **pm CANNOT read /sdcard**: `pm install` from /sdcard fails with an AVC
  denial — system_server has no read on `fuse` (measured 2026-11-17: "Use
  a file under /data/local/tmp/"). ALWAYS stage under /data/local/tmp/.
- On-device sha256 (`adb shell sha256sum`) gates the install, same as
  before. Zero network involved end-to-end.

## 1. Where things stand

Workstream: verify the Android app's QR scanner (ZXing swap, F-Droid
requirement) end-to-end on the Pixel 5, and complete F-Droid **Phase 1**
(FOSS purity). Phase 1 code is COMPLETE and committed; both flavors build
green in CI. What remains is on-device verification of the last two
scanner fixes plus the live decode round.

## 2. VERIFIED (device-proven on redfin / Pixel 5)

- **fdroid FOSS gating** (dump-verified on installed fdroid build,
  commit 1214c1d): 0 Guru⚡ chips; Account modal shows account facts +
  "Everything is free on this build — no billing, no upsell (F-Droid
  edition)"; no plans, no "Top up", no "Create new account"; Tools reads
  "Advanced features. Everything is free on this build." with ZERO PRO
  badges; Devices shows FREE badges on all rows.
- **SafeAreaView on all screens** (owner report: camera bleeding into the
  status bar): scanner modal wrapped in `SafeAreaView edges top+bottom`,
  same pattern as the Account modal (commit 0aacb36). Account modal layout
  verified correct on-device earlier the same day.
- **Camera + analysis pipeline**: binds and streams — `frames=N 640x480`
  ticking at ~15 fps in logcat after the 6 s watchdog rebinds
  analysis-only (the preview use case stalls; see §7).
- **Decode algorithm (host-proven)**: synthetic QR → padded-Y extraction
  (rowStride copy) → 90° CW rotation (the exact Kotlin math) → zxing-cpp
  → decoded the exact URL. PASS. The algorithm layer is correct.

## 3. BUILT GREEN but NOT yet device-verified

Release asset `rootmyandroid-fdroid-release.apk` on tag `android-apk`,
built by run `43792956330` (commit `0ddbe5e`), sha256
`7aa3a1d229a85e78427ec3067c3403794d97aac19b182bed4fc79214beaf4d02`
(verified on the runner download). Contains, stacked:

1. `4db5787` — **frame forensics**: the analyzer overwrites the latest
   ANALYZED luminance array to
   `/sdcard/Android/data/com.rootmyandroid/files/qr-frame.pgm` every ~300
   frames (~20 s). Pull it and decode host-side (PIL + zxing-cpp) — this
   settles definitively what the camera actually delivers.
2. `5389c36`+`0ddbe5e` — **manual TextureView surface hand-off**: a plain
   TextureView whose SurfaceTexture is handed DIRECTLY to the Preview
   use case's SurfaceRequest (bypasses PreviewView's negotiation, which
   hung session-configure at exactly 5000 ms in every mode — §7). The 6 s
   watchdog still rebinds analysis-only if no frames arrive, so decode
   survives even if the texture never appears.

## 4. Pixel 5 state right now

- Installed fdroid APK = commit `60b0988` (has rotation + insets +
  watchdog; does NOT have the manual-preview fix or forensics).
- The scanner modal is open with a BLACK preview area (expected on this
  build: analysis-only fallback after the preview stall). Harmless.
- Camera permission: granted (`USER_SET`).
- Serial `0C151FDD400648`. Header taps (fdroid layout, no chip):
  QR button ≈ (872,233), Account ≈ (986,233), tabs: Scan/Devices/
  Backups/Tools at y≈2228 (Devices ≈ x 404, Tools ≈ x 945).
- The device is SHARED — the owner and other teams use it. Confirm it's
  free before driving it; `dumpsys window | grep mCurrentFocus` first
  (`app.evonext` etc. mean the owner is using it — do NOT fight it).

## 5. Remaining checklist (in order)

**STATUS UPDATE 2026-11-17 (later session):** §5 items 1–2 are DONE and
superseded — the fdroid APK was installed via adb (`/data/local/tmp/`
staging; see §0 ruling) and the QR scanner + full walkthrough were
verified LIVE on the device:

- **Walkthrough of the fdroid listings (gate 5) PASSED on-device**:
  real scan (Pixel 5 (redfin), SDK 34, UP1A.231105.001.B2, bootloader
  Unlocked w/ raw props, Rooted Yes, `/product/bin/su` + Magisk reported
  with honest "(heuristic)" labels, integrity derived on-device with its
  disclaimer); **NO su dialog ever fired on this ROOTED device** (focus
  stayed on MainActivity — read-only claim verified); backup audit REAL
  (238 participating / 70 not covered, live from the OS); QR scanner
  modal opens with live camera; Tools tab renders "Advanced features.
  Everything is free on this build." and ZERO PRO strings in the whole
  UI dump; account modal = 16-digit number only. 7 screenshots captured
  (adb screencap → 9:16 crops → `apps/android/metadata/com.rootmyandroid/en-US/phoneScreenshots/`, commit 2051ee8).
- **Launcher icon set shipped** (commit 2f5e8ad): derived from the
  canonical SU hero render (full-body, brand-exact) via committed
  PIL generator `apps/android/tools/gen-launcher-icons.py` — legacy
  mipmaps + adaptive icons + 512 listing icons. (The nano-gpt
  image pipeline is NOT locatable in sanctioned stores this session —
  canon-derived per brand skill fallback doctrine; owner can swap in a
  model-generated icon render later.)
- **fdroid CI gate LIVE and green** (`.github/workflows/fdroid-gate.yml`,
  run 43926670849): fdroid rewritemeta zero-diff enforced on every
  recipe change. android.yml now publishes the EXACT asset
  `app-fdroid-release.apk` on v-tag pushes (Phase 4 dependency).
- 11-gate checklist ported to `docs/FDROID-CHECKLIST.md` (owner request).


1. **Get the 0ddbe5e APK onto the phone.** Fastest paths, host-free:
   - On-device: open Chrome to
     `https://github.com/nyusternie/rootmyandroid/releases/download/android-apk/rootmyandroid-fdroid-release.apk`,
     download, install from Downloads (note: redfin has NO wget/curl in
     toybox — browser it is; `pm install -r` from /sdcard/Download works).
   - Or: fix the host link (ethernet!) then `gh release download` — a
     healthy link does 17 MB in seconds.
   - The runner CAN download it in seconds (`/tmp/getapk.sh` on blackhost
     works); only the host↔runner leg is broken.
2. **Install + open scanner + logcat** `QrScanView` tag:
   - expect `surface texture available` → `preview surface delivered` →
     camera bound (preview+analysis, manual surface) → frames ticking;
     if the texture never arrives: watchdog fires (analysis-only) —
     decode still works, panel stays black, log says so.
3. **Owner aims at a QR** (print with python3 qrcode; WARNING: terminal
   ASCII QR with `invert=True` renders INVERTED on dark terminals — use a
   PNG on white instead: `qrcode.make_image`, `xdg-open`). Watch for
   `decoded: <url>` in logcat + footer text in the UI dump.
4. **Forensics**: `adb pull
   /sdcard/Android/data/com.rootmyandroid/files/qr-frame.pgm` → decode
   with PIL+zxing-cpp → if it decodes, the pipeline is proven end-to-end
   and any remaining failure is aim-timing; if the frame is garbage,
   the PGM shows exactly what's wrong.
5. **Restore the appstore rolling build** on the phone as the daily
   driver afterward (owner preference).

## 6. Session commits (chronological, all on master, all CI-green)

| commit | content |
| --- | --- |
| `54f0cd3` | F-Droid Phase 1: flavors (fdroid/appstore), dependenciesInfo off, legacy packaging, localhost pin, ML Kit→ZXing 3.5.3, IS_FDROID_BUILD module + metro redirect, UI gating, CI two-flavor build |
| `1214c1d` | metro flavor detection: RN 0.88 argv carries `fdroidRelease` in the bundle-output PATH, not the task name (measured run 43759473809) |
| `249c9d4` | analyzer diagnostics: frame ticker / decode / exception / bind logs (tag `QrScanView`) |
| `249f50d` | PreviewView COMPATIBLE (TextureView) — first anti-black-screen attempt (still stalled) |
| `9402258` | bind after first layout (post{}) + 6 s no-frames watchdog → analysis-only rebind + bind-generation guard |
| `0aacb36` | scanner modal inside SafeAreaView (status-bar bleed fix) |
| `60b0988` | rotate analysis frames by `imageInfo.rotationDegrees` (rotate90/rotate180 pure helpers) — sensor-orientation buffers fed ZXing a sideways QR |
| `4db5787` | PGM frame forensics dump |
| `5389c36` | manual TextureView→SurfaceRequest hand-off (replaces PreviewView) |
| `0ddbe5e` | Kotlin init-order fix (textureListener before textureView) |

Earlier in the session (pre-QR): `3bc42f3` = docs/FDROID-SUBMISSION-PLAN.md.
All prior commits: c9318ec…df44f86 (see previous handoffs).

## 7. Technical gotchas (all measured on redfin 2026-11-15/16)

- **PreviewView hangs CameraX session configuration inside the RN Modal**:
  camera opens (`onOpened`), then CameraX's 5 s watchdog fires
  ("ListFuture … is not done within 5000 ms" → "Resetting Capture
  Session") — in BOTH `PERFORMANCE` (SurfaceView) and `COMPATIBLE`
  (TextureView) implementation modes, bound from `onAttachedToWindow`
  AND from first layout (`post{}`). ImageAnalysis-only binds instantly
  and streams. Fix shipped: manual TextureView hand-off (§3).
- **ImageAnalysis buffers are sensor-oriented**: CameraX rotates the
  preview for display but NOT analysis buffers; redfin portrait =
  rotationDegrees 90 → QR arrives sideways → ZXing never decodes without
  the rotate-by-rotationDegrees step (frameCount ticks, zero decodes, no
  exceptions was the signature).
- **ZXing + TRY_HARDER**: set in `hints` (POSSIBLE_FORMATS QR-only);
  decode + `reset()` per frame on a single-thread executor.
- **RN 0.88 metro flavor detection**: match `/fdroidRelease|appstoreRelease/`
  in argv (bundle-output path), task-name regex kept as fallback.
- **Kotlin property init order**: properties initialize in declaration
  order — a listener consumed by a `val view = X().also{}` must be
  declared BEFORE it (CI failure `43790441412`).
- **fdroid UI gating**: `IS_FDROID_BUILD` from `./build-flavor`, metro
  redirects to `./build-flavor.fdroid.ts` only for the fdroid flavor.
- **Terminal ASCII QR polarity**: `print_ascii(invert=True)` renders
  black modules as full blocks → INVERTED image on dark-themed terminals
  → ZXing (Java port) can't decode. Always use a black-on-white PNG.
- **redfin toybox has no wget/curl** (checked) — on-device fetch = browser.
- **CI release assets**: download stalls from this host (§0). The runner
  downloads them in seconds; keep `/tmp/getapk.sh` pattern on blackhost.
- **Self-hosted runner cleans _work between jobs** — build outputs do not
  survive; fetch artifacts from the release, not the workspace.
- **Verification loop**: `gh workflow run android.yml --ref master`
  (ALWAYS explicit `--ref master`) → poll `gh run view <id> --json
  status,conclusion` → install via adb → `uiautomator dump` +
  `aapt2 dump badging`. Owner mandates: every command timeout ≤ 60 s,
  poll in tight bursts, no long blocking waits.

## 8. F-Droid — owner decisions are RESOLVED; Phases 2-4 remain

All four decisions confirmed by the owner (2026-11-13/15): scope =
`com.rootmyandroid` only; ML Kit → ZXing = YES; F-Droid build with
everything free = YES; upstream-signed route = YES.

- **Phase 1 (DONE, pending §5 verification)**: flavors, gating, ZXing,
  pins. The fdroid flavor IS the F-Droid build target.
- **Phase 2 — reproducibility proof**: conditional release-signing in
  `apps/android/android/app/build.gradle` is REQUIRED FIRST (leave
  signingConfig null when the keystore props are absent → unsigned APK
  from a clean checkout — sidecoin's approach, their build.gradle
  release-signing block ~lines 202-215; our current build.gradle FAILS
  a clean checkout because the props are unconditionally required).
  Then a two-path build on the runner (same commit, two checkout paths,
  one signed + one unsigned) + `apksigcopier compare` + zip-entry diff +
  `apksigner verify --print-certs` = upload key `1c59c433…bceca`.
- **Phase 3 — metadata/recipe**: Triple-T listings at
  `apps/android/android/app/src/<flavor>/play/listings/en-US/`
  (+512 icon, screenshots); maintenance recipe
  `apps/android/metadata/com.rootmyandroid.yml` (`subdir:
  apps/android/android/app`, `Binaries:` v%v → release URL,
  `AllowedAPKSigningKeys: 1c59c433…`, `AntiFeatures: NonFreeNet`,
  `sudo:` with pnpm@11.21.0, `scandelete: node_modules`, RN-family
  scanignore); CI rewritemeta gate (zero-diff).
- **Phase 4 — release + MR**: version bump → tag → release with EXACT
  asset name `app-fdroid-release.apk` → verify URL → bump/push
  fdroiddata MR (fork of gitlab.com/fdroid/fdroiddata) → tester rounds
  (expect 2-3). Model: sidecoin MR !50457 (route a — F-Droid builds from
  source, byte-compares, ships OUR binary on match). Costly sidecoin
  lessons: dependenciesInfo block, RN dev-IP resource, ABI bloat, stale
  second Builds: block, maintenance-copy drift, listing dishonesty,
  recipe-before-release 404, NonFreeNet reason required. Full plan:
  `docs/FDROID-SUBMISSION-PLAN.md`; sidecoin source:
  `/Workspace/apecsdev/sidecoin` (READ-ONLY, rule 9).

## 9. Owner rulings from today (2026-11-15/16) — BINDING

- Safe-area padding on ALL screens (done — verify the scanner modal
  visually after installing 0ddbe5e).
- Every command timeout ≤ 60 s; poll in short bursts; never block on long
  waits; check whether things already completed before re-running.
- Device is a shared resource: confirm free before driving; hand it back
  promptly; other teams need it.
- No more than one build cycle without reporting status; the owner wants
  frequent, honest status reports when verification rounds stretch.
- The scanner modal copy promises web pairing ("Pairing with web (alt
  clients) ships next") — after decode verification, build the web-side
  pairing protocol (see /terminal + relay work in AGENTS.md).

## 10. Owner rulings 2026-11-17 (BINDING)

- **NO direct Shizuku support.** "I DO NOT want to support Shizuku directly"
  — no Shizuku SDK, no `moe.shizuku` dependency, no Shizuku permission
  request, no pairing with the Shizuku app. Instead: "I want to copy/mimic
  the BEST features that Shizuku enables/supports" — replicate the
  CAPABILITIES through our own transports (wireless ADB in Rootz, rootzd
  root tier, WebUSB on the web /scan). `apps/android` has zero Shizuku
  references today (grep-verified) and stays that way.
- **Browser-download APK installs are RETIRED** (see §0): adb push over USB
  → `/data/local/tmp/` → `pm install -r`.

### Shizuku-capability parity, measured at uid 2000 on redfin (Android 14)

`adb shell` is uid 2000 — the SAME privilege Shizuku grants, so parity is
directly testable. Measured 2026-11-17 on serial `0C151FDD400648`:

| Capability (source app) | Shell command | Available |
|---|---|---|
| Shell exec + bookmarks (aShell You) | wireless-ADB shell, Rootz | YES — shipped + verified live 2026-11-09 |
| Kill running apps (Shappky) | `am force-stop <pkg>`, `am kill` | YES — both in `am help` |
| Install flags / downgrade (Install With Options) | `pm install [-rtfdg]` | YES — `-d` (downgrade), `-r`, `-f`, `-g`, `-t` |
| Storage cleanup (SD Maid SE) | `dumpsys diskstats`, `cmd package trim-caches` | YES — `Data-Free: 83% free` measured live |
| Hidden settings (Essentials) | `settings get/put` | YES — namespaces + get/put in `settings help` |
| Uninstall bloatware (Canta) | `pm uninstall` | Command exists — **BLOCKED by AGENTS.md rule 6** (no data-destroying commands on other packages); needs an explicit owner ruling |
| Per-app internet ban (ShizuWall) | `cmd netpolicy` | **NO** — Android 14 netpolicy exposes only restrict-background whitelist/blacklist + metered toggles, no per-UID internet block |
| Theming / overlay / widget (ColorBlendr, Adaptive Theme, Smartspacer) | — | **NO** — needs system-level permissions, out of reach at uid 2000 |

## 11. F-Droid pre-submission sweep (2026-11-20) — gate 10 + gate 5 closed

Reviewer-friction audit before the Phase-4 release. Two gates were tripped
in-tree; both are now closed and device-verified.

**Gate 10 — dead controls (mezinster's recurring finding, twice on
sidecoin).** Four instances found: `ToolRow` rendered a `›` chevron with no
handler, and three `PrimaryButton`s ("Pair a new device", "New backup",
"Top up — from $5") were tappable no-ops because `onPress` is optional in
the wrapper signature. Fix (commit `64e2726`): wrappers render INERT
(muted, bordered, non-pressable) when no handler is passed and carry a
note saying why; `ToolRow` drops the chevron. Repeatable check:
`node apps/android/tools/check-dead-controls.mjs` → 21 controls, 0 dead
(commit `55bb5f8`; negative-tested — removing a handler exits 1).

**Gate 5 — the listing claimed three things the app does not do.** All
three corrected in `full_description.txt` (commit `64e2726`):
- "turns those facts into a concrete rooting and upgrade plan" — `scan.ts`
  contains ZERO plan logic (`grep -i "plan\|recommend\|nextStep"` → no
  hits). The scan GRADES bootloader/root/integrity and shows evidence.
- "Pair with the web … pair the app with your account" — pairing is not
  wired; the QR modal itself says so. Now "QR scanner", on-device only.
- "save a scan report" — the sync posts the BACKUP AUDIT, not a scan
  report. Wording corrected.

**Honest surfaces (gates 5 + 9).** `mockDevices`, the fake
"Oct 15, 2026 · 1.2 GB" backup row and the hardcoded account number
`1327 3076 2982 9434` were removed; Devices/Backups/Account now render
explicit empty states. Storage figures are REAL: new
`AuditModule.getStorage()` (StatFs, no permission) → device-verified on
redfin "18.2 GB used of 109.1 GB", "Free 90.9 GB". All seven listing
screenshots re-captured (commit `93e0235`) — the old set showed the mock
surfaces and would have contradicted the shipped app.

**Recipe corrections.** NonFreeNet reason no longer names
`relay.rootmyandroid.com` (that socket belongs to the Rootz app;
`com.rootmyandroid` never opens it) and now states the offline behavior.
`QUERY_ALL_PACKAGES` justification documented in-file for reviewers (backup
audit + root-package detection; nothing uploaded during a scan). Gate 4
re-run on blackhost: `rewritemeta` parsed-equal, 1 Builds block.

**Still open before the MR:** nothing in-repo. Remaining = Phase 4
(version bump + tag + asset verify + recipe fill) and the owner's GitLab
account for the fdroiddata push.

## 12. Gap closure + GitLab staging (2026-11-20, later)

**Every "note" is gone — replaced by a working implementation** (commit
`96f1588`, contract-fix `03895e8`). Gate 10 is satisfied by real controls,
not by inert rows: checker reports 24 controls / 0 dead / 0 `note=`
attributes.

| Gap | Now |
|---|---|
| `ToolRow` chevron, no handler | Tools = Integrity auditor → Scan tab; Rooting / Bootloader / Logcat guides → the three real `/guides` pages; Health monitor → live battery (level/temp/health from the sticky battery broadcast, tap re-reads); Storage manager → Backups storage panel. The unimplementable "OTA survival assistant" row was REMOVED rather than annotated. |
| "Pair a new device" | Opens the native QR scanner in PAIRING mode; the decoded code is saved locally as a paired device (label = URL host) and listed with a working Remove. Nothing is uploaded. Deliberately NOT `guardian/sync` — that charges Halo for a new device. |
| "New backup" | Collects the backup-audit snapshot → AES-256-GCM encrypt with an Android Keystore key (`AuditModule.encryptBackup`, non-exportable) → `POST /v1/backups`; list read back from `POST /v1/backups/list`. |
| "Top up" | Opens `rootmyandroid.com/account` (the real invoice surface). |
| "Create new account" | `POST /v1/accounts` → 16-digit number persisted in app-private prefs, shared with the Scan-tab sync field. |

Contract facts measured against the live API (2026-11-20, host-side curl
with the exact app bodies): `POST /v1/backups` → 201; `POST
/v1/backups/list` → 200 with `{created_at, device_label, kind, r2_key,
size_bytes}` — **no `id` field**, so the list keys rows by `r2_key`
(commit `03895e8` fixed a real bug caught this way). `POST /v1/accounts`
→ 201.

**F-Droid flavor note:** account creation + top-up live inside the
`!IS_FDROID_BUILD` branch, so the F-Droid build still ships NO billing and
NO account-creation UI (owner ruling 2026-11-13). F-Droid users create an
account on the website and enter the number in the Scan tab.

**Device verification (partial — the owner took the phone):** Tools screen
verified live on the fdroid build (`Battery 100% · 28.1°C · good`,
`18.2 GB used of 109.1 GB`, all guide rows tappable), Devices pairing modal
opens with the "Pair a device" title, Backups/Account render the real
StatFs values. NOT yet device-verified: the full backup upload from the
app, and account creation from the appstore build (both blocked on the
device being free; the API halves are proven).

**GitLab staged:** `gitlab.com/nyusternie/rootmyandroid` (public, default
branch `main`) now mirrors master at `03895e8`. Push used the EXISTING
`glab` keyring session + the pre-registered `id_rsa` on this host — no new
credential was created or stored (rule 11). The 63 MiB pack took ~10 min
at 30–200 KiB/s (the §0 link trap), so the push ran detached with polling.
NOTE: this repo is a mirror, NOT the F-Droid MR target — the MR goes to a
fork of `gitlab.com/fdroid/fdroiddata` (plan Phase 4).

## 13. v26.11.20 RELEASED + fdroiddata branch staged (2026-11-20, final)

**Device verification COMPLETE** (Pixel 5, serial `0C151FDD400648`, appstore
flavor installed for the account-creation UI):
- **Account creation works end-to-end**: Account → Create new account →
  the app POSTed `/v1/accounts` and rendered `2610 4953 9541 0159`;
  `GET /v1/accounts/2610495395410159` → HTTP 200, `created_at
  2026-11-20T21:52:44Z`. Survived a force-stop + relaunch (getPref).
- **Backup works end-to-end**: New backup → audit snapshot → Keystore
  AES-256-GCM → `POST /v1/backups` → the app showed "Backups (1)" with the
  row `Google Pixel 5 · encrypted · 11/20/2026`; the server confirms 1 row,
  **43122 bytes**, `created_at 2026-11-20T21:55:07Z`.
- Cosmetic fix caught by that test: a 43 KB payload rendered as "0 MB" →
  `fmtBytes` now shows KB below 1 MB.
- NOT camera-verified: the pairing SAVE path (needs a second screen to show
  a QR). Its decode path was verified live in an earlier session; its
  persistence uses the same getPref/setPref proven by the account number.

**Gate 1/2 violation found and fixed**: the recipe's `Builds:` claimed
`26.11.16/20261116` while build.gradle + package.json + CurrentVersion said
`26.11.10/20261110`. The release bump made all four agree on
**26.11.20 / 20261120** (commit `9149030`, tag `v26.11.20`).

**Release published and verified (gate 11 prerequisite):**
- Tag CI run `44826709506` SUCCESS on blackhost.
- `releases/download/v26.11.20/app-fdroid-release.apk` → `curl -sIL` HTTP
  200, **17,993,300 bytes**, sha256
  `c1330ba30ca7cd2b65c476470fb1c160fa1ef49d42b63558c92540a94b330b30`;
  `aapt2 dump badging` → `versionCode='20261120' versionName='26.11.20'`
  (matches the recipe exactly).
- Daily driver on the phone = `app-appstore-release.apk` from the same tag
  (`3ee7923c…`, versionCode 20261120 / versionName 26.11.20).

**fdroiddata staging (MR NOT opened yet):**
- Fork: `gitlab.com/nyusternie/fdroiddata` (project id **89251913**),
  imported from fdroiddata master `aed9e850`.
- Branch **`com.rootmyandroid`** = master + 2 commits, exactly ONE new file
  `metadata/com.rootmyandroid.yml`; local↔remote sha256 MATCH
  (`474e9104…`).
- Recipe filled: `commit: 9149030147d94b7dd79976f885a65e6f9cd89af7` (the
  tagged commit), measured asset facts in the comment (gate 3),
  `CurrentVersion 26.11.20`, `WebSite` added. `rewritemeta` gate re-run
  after every edit: parsed-equal, one Builds block.
- The MR itself is deliberately NOT opened — that is the visible submission
  (gate 11 sequencing complete, so it is one API call away).

## 14. Store metadata — WHERE it comes from (verified in fdroidserver source)

**Answer to "don't we need title/description":** the recipe YAML carries NO
Summary/Description — fdroidserver reads them from store metadata, and I
verified the exact code paths in `/tmp/fdsv/.../fdroidserver/update.py` on
blackhost, then proved them by running the real functions against synthetic
trees:

| Reader | Scans | Result |
|---|---|---|
| `copy_triple_t_store_metadata` | `<repo>/<subdir>/src/<flavor>/play/listings/<locale>/` (flavor from `Builds[].gradle` — ours is `fdroid`) | text OK; **screenshots land in `phone-screenshots/` (hyphen) — a dir F-Droid does not serve** (the v2 branch keys on `segments[-4] == 'listings'`, which our path depth does not match — measured, not assumed) |
| `insert_localized_app_metadata` | `metadata/<appid>/<locale>/` **in the fdroiddata repo**, plus fastlane dirs | **everything works**: `title.txt`→name, `short_description.txt`→summary, `full_description.txt`→description, `icon.png`→icon, `phoneScreenshots/*.png`→`phoneScreenshots` |

So the listing was moved to the fdroiddata side, which ALSO means the
metadata does not depend on the app commit (`commit: 9149030…` still
builds the released APK).

**Values shipped (all within F-Droid char limits):**
- name (`title.txt`): `Root My Android` — 15/50
- summary (`short_description.txt`): `On-device Android root and upgrade scan — read-only, no account needed` — 70/80
- description (`full_description.txt`): 2257/4000, sections: Device scan / Backup audit / QR scanner / Account sync, plus DESIGNED FOR SAFETY, MIT + no-billing note, and the NonFreeNet explanation
- icon: 512x512 PNG (full-body SU robot, brand canon)
- 7 phone screenshots (device-captured, 9:16)

**Recipe field validity confirmed against fdroiddata's own config:**
`NonFreeNet` is defined in `config/antiFeatures.yml` (L29); `Security` (L269)
and `System` (L296) are defined in `config/categories.yml`. The three
"not valid" messages from a bare `fdroid lint` run were artifacts of my
scratch dir lacking that `config/` tree.

**fdroiddata branch `com.rootmyandroid` now contains** (project 89251913):
`metadata/com.rootmyandroid.yml` + `metadata/com.rootmyandroid/en-US/`
{title.txt, short_description.txt, full_description.txt, icon.png,
phoneScreenshots/ ×7} — text sha256 MATCHes the app repo's Triple-T copy.

**Known content gap (owner decision):** the description does not yet
mention the features added in §12 (encrypted backup upload, QR pairing,
Tools: guides/health/storage). It is accurate as written, just incomplete.
