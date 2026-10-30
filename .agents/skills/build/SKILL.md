---
name: build
description: Build and deploy rules for the Root My Android monorepo. Use for ANY build, test, or deploy task — web or mobile. Covers the no-host-builds rule, release-only mobile builds, and runner/deploy topology.
---

# Build rules (owner-mandated)

These rules are standing owner decisions (2026-10). Follow them for every
build task in this repository; do not "optimize" around them.

## 1. Never build on the host

Do NOT run builds (gradle, pnpm build, astro build, bundling, compiles) on
the interactive host (`shomari-elitebook`). Always use a runner or VM:

- **Self-hosted CI runner `blackhost`** (labels: `self-hosted, blackhost`) —
  via GitHub Actions. Web CI is `.github/workflows/web.yml`; the mobile
  preview build is `.github/workflows/android-preview.yml`
  (`workflow_dispatch` — dispatch it, watch with `gh run watch`, fetch
  artifacts with `gh run download`).
- **macOS/Xcode runner** — for real iOS builds (Podfile + xcodebuild).
- Local file editing, `git` operations, and `adb install` (deployment, not
  compilation) are fine on the host.

## 2. Mobile: release builds ONLY

Build mobile apps in the RELEASE configuration only
(`./gradlew assembleRelease`, never `assembleDebug`). Rationale: release
builds bundle the JS (Hermes bytecode) into the APK via
`bundleReleaseJsAndAssets`, so **no Metro dev server is needed** — Metro
running on the host slows it down. Slower builds are accepted.

Consequences:

- The preview shell (`apps/ios/android`, applicationId
  `com.rootmyandroid.preview`) signs release builds with the **public debug
  key** — preview-only, never publish such APKs. See
  `apps/ios/android/app/build.gradle`.
- The real Android app (`apps/android`, applicationId `com.rootmyandroid`)
  signs release with the out-of-band upload keystore
  (`ROOTMYANDROID_UPLOAD_*` env/project properties). The keystore and its
  passwords are PRIVATE: never commit them, never echo them into CI logs,
  workflow files, or artifacts (repo rule 3a). `gradle.properties` is
  gitignored for this reason — runners write their own (see the preview
  workflow).
- `reactNativeArchitectures` for preview builds: `armeabi-v7a,arm64-v8a`
  (physical phones; no emulator ABIs — keeps runner builds shorter).

## 3. Deploy to devices from the host via adb

Fresh runner checkouts lack the app-local `node_modules` symlink farms that
RN gradle/codegen tooling hardcodes (pnpm hoisted installs only to the
workspace root; the farms on dev machines are untracked local state). Run
`scripts/materialize-rn-farm.sh <app-dir>` (bundled with this skill) before
any gradle/xcode build — the android-preview workflow does exactly this.

The physical test device (Pixel 5) is USB-attached to the host. After a
runner build finishes:

```bash
gh run download <run-id> -n rootmyandroid-preview-apk
adb install -r app-release.apk
```

`adb install` is deployment, not a build — allowed on the host. Deploy ONLY
the iOS-edition preview (`com.rootmyandroid.preview`) to the physical
device — do NOT install Rooted or Guardian builds on it (owner rule,
2026-10-30). Never run data-destroying adb commands on third-party
packages (repo AGENTS.md rule 6).
Our package ids: `com.rootmyandroid` (Rooted, Android), `com.rootmyandroid`
(RootMyAndroid, iOS bundle id), `com.rootmyandroid.preview` (Android preview
of the iOS edition — distinct id so it never clobbers Rooted on-device),
`com.rootmyandroid.guardian`.

## 4. Pull before you push

Another team works on frontend + mobile in this repo. ALWAYS
`git pull --rebase origin master` immediately before `git push` — every
time, even if you pulled recently. Rebase local work onto their latest;
never force-push.

## Gates

Every push to `master` runs web check → tests → build on `blackhost` and
only then deploys to Cloudflare Pages (`web.yml`). The preview workflow runs
`pnpm -r test` (all workspace packages) before building the APK. Never
deploy with failing tests.
