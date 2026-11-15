# F-Droid Submission Plan — Root My Android (com.rootmyandroid)

Status: PLAN (pre-submission) — prepared 2026-11-13, after studying the
accepted Sidecoin submission end-to-end (repo `/Workspace/apecsdev/sidecoin`,
MR fdroiddata!50457, merged 2026-11-15 by linsui).

This document maps the Sidecoin F-Droid journey onto our monorepo, audits
`apps/android` against every gate that cost them a review round, and lays out
the phased path to a merged fdroiddata MR.

---

## 1. What Sidecoin went through (the trail)

Route they used: **(a) upstream-signed binary** — F-Droid builds from source,
byte-compares against our hosted APK (`Binaries:` URL + `AllowedAPKSigningKeys`
cert pin), and ships OUR signed APK only on a byte match. On any mismatch,
publish is skipped (never re-signed).

Timeline of findings that each cost a review round (do not repeat):

| Finding | Reviewer | Fix |
| --- | --- | --- |
| Prebuilt OpenSSL AAR (`io.github.ronickg:openssl`) shipped `libcrypto.so`/`libssl.so` via Gradle — invisible to `scandelete` | mezinster | Drop quick-crypto/nitro; pure-JS crypto only |
| Prebuilt Skia `.a` statics (653 MB) | linsui | Removed victory-native/skia; pure react-native-svg charts |
| `react-native-vision-camera` + MLKit and passkey/play-services — proprietary | (pre-submission audit) | Removed; QR = own CameraX + **ZXing** implementation |
| AGP "Dependency metadata" signing block rejected by `fdroid check apk` | CI | `dependenciesInfo { includeInAPK = false }` |
| `resources.arsc` reproducibility failure: RN Gradle plugin bakes the build host IP (`react_native_dev_server_ip`) | CI | finalizeDsl pin to `localhost` |
| APK size: all 4 ABIs → 148 MB; uncompressed `.so` → 74 MB | (self) | `reactNativeArchitectures=arm64-v8a,armeabi-v7a` + `useLegacyPackaging = true` → ~20 MB |
| Recipe `subdir` wrong (android root instead of the `app` module) → "Failed to find any output apks" | CI | `subdir: apps/mobile/android/app` |
| Stale second `Builds:` block → F-Droid built and published BOTH versions | mezinster | Exactly ONE Builds block, ever |
| Maintenance copy drifted from fdroiddata copy | (self) | Bump both in the same change |
| Listing promised unwired features; dead `Pressable`s; hardcoded literals exposed after flavor ungating; PRO strings survived a "sweep"; inset bugs on self-rooted screens | mezinster, junkerderprovinz | 11-gate checklist (below) |
| Recipe pushed BEFORE the GitHub release asset existed → CI `Binaries:` 404, ~25 min wasted | (self) | Gate 11: recipe push LAST |
| `NonFreeNet` reason missing for hosted services | linsui | AntiFeatures with localized reason |
| `fdroid rewritemeta` must produce zero diff; comments are stripped from the fdroiddata copy | (self) | Edit maintenance copy → copy over → rewritemeta; CI enforces |

Reviewer's test cycle: green fdroiddata MR pipeline → CI `fdroid build` (downloads
`Binaries:` at the END; ~25 min) → `check apk` (scanner + reproducibility) →
2-3 independent human testers walk every screen → merge.

---

## 2. Audit of `apps/android` (com.rootmyandroid) against the gates

Already compliant:

- **MIT LICENSE** at repo root.
- **versionCode 20261110 = YYYYMMDD scheme** — same monotonic scheme Sidecoin
  proved; matches rule 10 (date-based versions).
- **No Firebase / GMS / Play-Services / crash-reporting SDKs** — nothing to
  exclude on the flavor.
- **No third-party analytics** in the Android app (the web beacon does not
  ship in RN; nothing to noop out).
- **Signing**: CI already builds release APKs signed with OUR upload key
  (blackhost `/home/gh-runner/secrets/rootmyandroid-upload.*`). Cert SHA-256
  `1c59c433…bceca` (confirm full 64-hex at execution time) → direct
  `AllowedAPKSigningKeys` input.
- **Public GitHub repo** for `Repo:` + tag/asset hosting.
- **No paid/unlock code path inside the app** today (billing UI is a mock
  chip; nothing is purchasable in-app) — smaller flavor surface than
  Sidecoin's PRO-tier sweep.

Must fix before submission (each traces to a Sidecoin finding):

1. **ML Kit is proprietary and will be rejected.**
   `com.google.mlkit:barcode-scanning:17.3.0` (added this session for the QR
   wire-up) is a closed-source Google binary. Direct precedent: Sidecoin
   removed vision-camera/MLKit and wrote "QR scanning is now our own CameraX
   + ZXing implementation". We already own the CameraX analysis scaffold
   (`QrScanView.kt`) — swap the MLKit scanner for **ZXing core
   (`com.google.zxing:core`, Apache-2.0)** with a YUV→luminance converter.
   QR-only, so ZXing coverage is sufficient.
2. **Reproducibility pins** (required for route (a)):
   - `dependenciesInfo { includeInAPK = false; includeInBundle = false }`
     (AGP writes the Dependency metadata signing block by default).
   - Pin `react_native_dev_server_ip` to `localhost` via a finalizeDsl
     callback on `:app` (RN plugin fills it with the build host's IP).
   - Verify byte-reproducibility by building the same commit from two
     different absolute paths on blackhost and running
     `apksigcopier compare --unsigned` + zip-entry diff.
3. **Size work**: `reactNativeArchitectures=arm64-v8a,armeabi-v7a`
   (currently all four) + `packaging { jniLibs { useLegacyPackaging = true } }`.
4. **Flavor `fdroid` (+ `appstore`)** with an `IS_FDROID_BUILD` metro flag
   module, gating:
   - the mock `Guru⚡` billing chip (a fake balance display is a reviewer
     magnet),
   - "PRO tools require time credit" / other paid-tier copy (checklist gate
     7-style grep sweep),
   - anything else that implies payment/upgrade inside the F-Droid build.
5. **Triple-T store metadata** at
   `apps/android/android/app/src/<flavor>/play/listings/en-US/`:
   `title.txt`, `short-description.txt`, `full-description.txt` (walk it
   line-by-line against real screens — Sidecoin's listing/description
   findings), `graphics/icon/icon.png` (512×512), phone screenshots.
6. **Recipe**: maintenance copy `apps/android/metadata/com.rootmyandroid.yml`
   (commented) → fdroiddata copy (comment-free, rewritemeta-verified):
   `Repo: https://github.com/nyusternie/rootmyandroid.git`,
   `subdir: apps/android/android/app`, `gradle: [fdroid]`,
   `Binaries: https://github.com/nyusternie/rootmyandroid/releases/download/v%v/app-fdroid-release.apk`,
   `AllowedAPKSigningKeys: <cert sha256>`,
   `AutoUpdateMode: Version`, `UpdateCheckMode: Tags`,
   `AntiFeatures: NonFreeNet` (talks to `rootmyandroid.com/v1`),
   `sudo:` (JDK 17 from bookworm on the trixie buildserver + node from forky +
   `pnpm@11.21.0` — OUR pin differs from Sidecoin's 9.15.4),
   `init:` (`CI=true pnpm install --frozen-lockfile` — verify the workspace
   has no non-CI-guarded postinstall first),
   `scandelete: node_modules` + `scanignore` for the RN-family
   `android/build.gradle` maven-URL false positives + `hermesc` (our
   `nodeLinker: hoisted` layout makes these plain `node_modules/…` paths —
   simpler than Sidecoin's `.pnpm/<hash>` globs).
7. **Release asset name**: every tagged release must upload the APK with the
   EXACT filename `app-fdroid-release.apk` (`gh release upload`, not
   `file#label`).
8. **CI**: add a `rewritemeta` zero-diff gate + (optional) a release job that
   renames/publishes the exact asset; record the recipe checklist into the
   workflow so the gates are enforced, not remembered.

---

## 3. Phased plan

**Phase 0 — decisions (owner).** See §4 questions. Blocks everything.

**Phase 1 — FOSS purity (code).**
- Swap MLKit → ZXing in `QrScanView.kt` (keep the CameraX scaffold + event
  contract; re-verify the live scan on the Pixel 5).
- Add `fdroid`/`appstore` flavors + `IS_FDROID_BUILD` flag module; gate the
  billing chip + PRO copy; run the checklist-7 string grep sweep.
- Gradle: dependenciesInfo, dev-server-ip pin, ABIs, legacy packaging.
- Full validation: tsc, jest, live scan test, UI walkthrough of every tab on
  the fdroid flavor.

**Phase 2 — reproducibility (build infra).**
- Build twice from two paths on blackhost; apksigcopier + zip-entry diff.
- Fix whatever leaks (paths, IP, timestamps) until byte-identical.
- Confirm `apksigner verify --print-certs` matches the upload-key cert.

**Phase 3 — metadata + recipe (in-repo).**
- Triple-T listings + icon 512 + screenshots (device captures, honest copy).
- Maintenance recipe YAML with the full comment history.
- CI rewritemeta gate; release-asset publishing workflow.
- Port the 11-gate checklist into our docs/CI.

**Phase 4 — release + submission (ordering is gate 11).**
- Bump version (date scheme), tag `vYY.M.D`, CI green.
- GitHub release + `app-fdroid-release.apk` upload; `curl -sIL` verify 200 +
  content-length + sha256 recorded.
- THEN bump + push the fdroiddata branch (fork of gitlab.com/fdroid/fdroiddata)
  → MR → CI build (download + check apk + reproducibility) green.
- Answer tester reviews (expect 2-3 rounds: linsui + testers walk every
  screen; run our own self-audit sweep BEFORE replying — the Sidecoin
  pattern).
- Merge → buildbot publishes → verify `curl https://f-droid.org/api/v1/packages/com.rootmyandroid`.

**Recurring release protocol (post-acceptance):**
master → tag + release + asset upload → verify URL → bump BOTH recipe copies
→ rewritemeta → push fdroiddata. One Builds block. Every time.

---

## 4. Open decisions (owner)

1. **Scope** — submit `com.rootmyandroid` only (recommended), or also Rootz
   (`com.rootmyandroid.rootz`) and Guardian Angel previews? Recommend one app
   first; previews are moving targets under review.
2. **ML Kit → ZXing** — required for FOSS inclusion; confirm the swap
   (small decode-quality tradeoff, QR-only use, sidecoin precedent).
3. **fdroid-flavor policy for the billing chip + PRO copy** — recommend
   Sidecoin's route: F-Droid build shows everything free, no payment/upsell
   UI at all (the chip is a mock today, so removing it on the flavor is also
   the honest state).
4. **Route (a) upstream-signed** (Sidecoin's route; needs the Phase-2
   reproducibility work but keeps key continuity) vs default F-Droid signing
   (simpler, but users get F-Droid's key, breaking update-continuity with our
   sideload APKs — an installed F-Droid-signed build will not accept our
   upload-key updates without uninstall). Recommend (a).

---

## 5. Estimated effort

- Phase 1: one session (MLKit swap + flavors + gradle pins + sweeps).
- Phase 2: one blackhost session (reproducibility can surface surprises; the
  two known RN 0.88 culprits are pre-pinned).
- Phase 3: one session (metadata, recipe, CI).
- Phase 4: release day + review latency (F-Droid queue: days-to-weeks for
  first bot round; tester rounds add days each).
