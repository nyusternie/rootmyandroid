# HANDOFF — F-Droid MR !58486 (com.rootmyandroid, re-submission)

**MR:** https://gitlab.com/fdroid/fdroiddata/-/merge_requests/58486
**Title:** `New app: Root My Android`
**Branch:** `com.rootmyandroid` on `nyusternie/fdroiddata` (project 89251913),
commit `6449ae6663fbac96a88ef7a37f73175bdfe043d7`, based on the fork's
`master` (`aed9e850`, one day behind upstream `c4d5a225`).
**Changes:** exactly ONE file — `metadata/com.rootmyandroid.yml`.

Supersedes **!58356**, closed 2026-11-21 by linsui with *"Merge Request
template is not followed."* The pipeline had been fully green; a green
pipeline is not acceptance.

---

## 1. What was wrong last time, and what is different now

| !58356 | !58486 |
|---|---|
| free-form technical prose, no template structure | `Default.md` structure verbatim: both `## Abstract` sections, then the checklist — **28/28 items character-identical** to master's template (mechanical diff) |
| 13 files in the MR (store metadata) | 1 file: `metadata/com.rootmyandroid.yml` — store metadata moved upstream to `fastlane/metadata/android/en-US/` |
| no `/label ~"New App"` | quick action present (the author cannot apply labels; maintainers do) |
| no screenshots | 4 embedded inline in the Abstract + pointer to all 8 upstream |
| no explanation of the Reports tab | all four `info`/`minor` entries explained (INTERNET, QUERY_ALL_PACKAGES, CAMERA, no R8 marker) |

## 2. Release the MR points at

- Tag **`v26.11.26`** → commit `0d30c05f37d0e9139b78724802b174471227858b`.
- Asset `app-fdroid-release.apk`, **17,993,300 bytes**,
  sha256 `8e09aca68caf9444c3aca96275bee943db799f2890a45026c0e0fd0418ec5da8`
  (GitHub asset digest + `sha256sum` on blackhost).
- Badging read from the asset on blackhost:
  `versionCode='20261126' versionName='26.11.26'`, package
  `com.rootmyandroid`; native libs `arm64-v8a` + `armeabi-v7a` only.
- Signed: the release build only emits `app-fdroid-release.apk` (not
  `-unsigned`) when the `ROOTMYANDROID_UPLOAD_*` properties are present
  (`build.gradle` conditional release signing), so the blackhost upload
  keystore signed it.
- This release exists **only** to carry
  `fastlane/metadata/android/en-US/changelogs/20261126.txt` (the
  `whatsNew` entry). The app is unchanged since 26.11.25.

## 3. Recipe facts that cost a full CI round each, do not regress

- `Binaries: ` block form **with the trailing space** — that is
  `fdroid rewritemeta` output; verified byte-identical against
  **fdroidserver master** (the CI's authority), not just the local 2.4.4.
- `scanignore` (all load-bearing): `.vendor`, `apps/desktop`,
  `node_modules/react-native/ReactAndroid/publish.gradle`,
  `node_modules/hermes-compiler/hermesc/linux64-bin/hermesc`, and the
  three library `build.gradle` files that declare a local maven repo
  (lottie-react-native, react-native-safe-area-context, react-native-svg).
- `init:` materializes the app-local `node_modules` symlinks
  (react-native, @react-native/codegen, hermes-compiler) — pnpm `hoisted`
  puts them only at the workspace root.
- `sudo:` pulls node/npm from Debian **forky** (the app's `engines.node`
  is `>= 22.11.0`) and JDK 17 from **bookworm**. Fragile by nature
  (testing suite), proven green.
- The comparison that matters is `fdroid build` → `fdroid publish
  --error-on-failed`, not `check apk`.

## 4. Known non-issues (do not "fix")

- `fastlane/` sits at the **repo root**, not `apps/android/fastlane/` —
  fdroidserver globs `build/<pkg>/fastlane/metadata/android/<locale>`, so
  it is found.
- The Triple-T listing under `apps/android/android/app/src/fdroid/play/`
  is read too; its text and icon are identical to the fastlane copies.
- The in-repo `apps/android/metadata/com.rootmyandroid.yml` is the
  commented DRAFT; the file pushed to fdroiddata is
  `apps/android/metadata/fdroiddata-submission/com.rootmyandroid.yml`
  (comment-free `rewritemeta` output). They are semantically identical.

## 5. Gotchas hit this session

- `POST /projects/fdroid%2Ffdroiddata/merge_requests` returns **403** for
  a non-member on GitLab 19.7.0-pre. Create the MR from the **source**
  project instead:
  `POST /projects/89251913/merge_requests` with
  `"target_project_id": 36528`.
- The fork cannot resolve upstream commits by SHA (`start_sha` 400,
  `repository/commits/<sha>` 404), and a `git fetch` of the fork's master
  times out through this host's link. Branch from the fork's `master` and
  let GitLab compute the diff against the target's merge base.
- `glab api --input` needs `-H "Content-Type: application/json"`.
- `glab api` on this version has **no** `--jq`; pipe to `jq`.

## 6. Pipeline — ALL 9 JOBS GREEN (2026-11-21 18:57 UTC)

Pipeline `3098009132` on `6449ae66`, `status: success`:
`checkupdates`, `git redirect`, `fdroid lint`, `fdroid rewritemeta`,
`schema validation`, `tools check scripts`, `check source code`,
`fdroid build` (611 s), `check apk`.

The two lines that matter, from job 18248983596 (`fdroid build`):

```
INFO: compared built binary to supplied reference binary successfully
INFO: supplied reference binary has allowed signer 1c59c4331c9c8f1fc0e41578ef47ac404396ba7596f5a4c8e94528d4886bceca
```

`check apk` (job 18248983594) reported, all `info`/`minor`:
`APK ABI and size: arm64-v8a (12M) armeabi-v7a (11M), 18M` ·
`APK has no R8 Marker, R8 is not used` · `Permission INTERNET` ·
`Permission QUERY_ALL_PACKAGES` · `Permission CAMERA` ·
`Permission com.rootmyandroid.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` ·
`Signing Key: CN=Root My Android Upload, OU=Engineering, O=Root My Android`.
All seven are explained in the MR description's Pipeline section.

## 7. Open item

`labels: []` on the MR: a non-member cannot set labels on
`fdroid/fdroiddata` (the `/label ~"New App"` quick action in the
description is a no-op for us — GitLab returns 200 and ignores it). A
maintainer applies it during triage; the template line is present, which
is what the checklist asks for.

## 8. JDK 21 round (2026-11-21 evening) — reviewer request, and what it cost

@linsui, 19:21Z on !58486: *"Can you use jdk 21? See the template at
templates/build-react-native.yml"*. The recipe had installed
`openjdk-17-jdk-headless` from **bookworm** (copied from
`dev.djara.wafrn_rn`) because the RN Gradle plugin pins
`jvmToolchain(17)`. That works, but it DOWNGRADES the buildserver image
(Debian trixie ships openjdk-21) and contradicts the template, which
added the `jvmToolchain`/`JavaVersion` 17→21 sed on 2026-05-10
(commit 5230360a). Lesson: derive a recipe from `templates/build-*.yml`,
never from another app's merged recipe — a merged recipe is a snapshot of
someone else's workaround.

Three releases were burned finding the second half of the problem:

- **26.11.27** (`6eab155`) — recipe switched to the template sed. Pipeline
  3098197098 `fdroid build` FAILED the byte comparison.
- **26.11.28** (`13c3f95`) — the missing half: **our CI must apply the
  same sed**. Pipeline 3098300035 green, `compared built binary to
  supplied reference binary successfully`.

Why the second half was needed (measured, not assumed): the sed
recompiles `@react-native/gradle-plugin` at 21, which changes the Gradle
artifact-transform cache key. That key is compiled into
`libappmodules.so`'s `.rodata` as
`.gradle-home/caches/9.4.1/transforms/<hash>/transformed/react-android-0.88.0-release/prefab/…/propsConversions.h`
(184 chars; only the 32-char hash differs). Reference carried
`23ffe694…`, buildserver `7db65e98…`; the string shift cascaded into
1,736/5,201/1,478 differing bytes in the three `.so`. The JDK version
alone does NOT move the key (26.11.26 JDK 17 and 26.11.27 JDK 21 on
blackhost both produced `23ffe694…`).

Proof method that avoided a fourth release: build
`assembleFdroidRelease` on blackhost **with the sed**, then compare the
`.so`/`.dex` byte-for-byte against F-Droid's own built APK from the
failed job's artifact. With the sed all three `.so` and the transform
key matched exactly; `classes2.dex` differed only because the version
bump changes `BuildConfig`.

Rules that follow:
1. Never change two inputs of a byte-reproducibility chain at once.
2. When a comparison fails, the failing artifact is usually still
   downloadable — prove the fix against it before tagging anything.
3. The CI build and the recipe must run the SAME transformation; the
   workflow step and the recipe `init:` sed are intentionally identical.

## 9. CI incident (2026-11-21)

- Run 44944675442 first attempt died on `No space left on device`
  (runner could not write its own log) — blackhost was at 96 % with
  1.6 G free. Freed 2.05 G of `_work/_update` + `pnpm store prune`
  (364 MB) → 4.2 G.
- First rerun failed on a load-dependent jest timeout in
  `apps/android/__tests__/App.test.tsx` (default 5 s, measured 18.4 s).
  Test now carries an explicit 30 s timeout; the assertion is unchanged.
