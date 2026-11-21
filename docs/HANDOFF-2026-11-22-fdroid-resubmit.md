# HANDOFF — F-Droid RE-SUBMISSION (next session)

**Mission: re-submit `com.rootmyandroid` correctly, then spend the rest of
the session reviewing other people's fdroiddata MRs.**

The first MR (!58356) was **closed 2026-11-21 by linsui**: *"Merge Request
template is not followed."* The pipeline was green — `fdroid build` and
`check apk` both passed. **A green pipeline is not acceptance.**

---

## 1. Everything is prepared. Nothing is submitted.

| Artifact | Location | State |
|---|---|---|
| Recipe to push (comment-free, `rewritemeta` output) | `apps/android/metadata/fdroiddata-submission/com.rootmyandroid.yml` | ready |
| Filled MR description (template structure, 28 ticked items + "why") | `apps/android/metadata/fdroiddata-submission/mr-description.md` | ready |
| Release | `v26.11.25`, commit `9079ba2186306859509f2ac2aed68257d82bd123` | **published** |
| Asset | `app-fdroid-release.apk` 17,993,300 B, sha256 `3057d8f50e048a077042ac275e943f96bc3dd148ecf61f5778dccc3568bdee4e`, badging `20261125 / 26.11.25` | verified |
| Upstream store metadata | `fastlane/metadata/android/en-US/` (title, short+full description, `images/icon.png`, 8 `phoneScreenshots/`) | **committed in v26.11.25** |
| Fork | `gitlab.com/nyusternie/fdroiddata`, project **89251913**, branch `com.rootmyandroid` | branch currently still carries 13 files |

**The branch is the only thing left to fix**: it must carry exactly ONE
file, `metadata/com.rootmyandroid.yml`.

---

## 2. Re-submission procedure (exact order)

1. **Sync the fork's `master`** (it is 1 day behind upstream: `aed9e850`
   vs upstream `edf3f048`), then rebase `com.rootmyandroid` on it. The
   branch adds one file, so the rebase is clean. Template guidance: *don't
   rebase if there is no conflict* — but a stale base is worse.
2. **Delete the 12 store-metadata files** from the branch:
   `metadata/com.rootmyandroid/en-US/{name,summary,description}.txt`,
   `icon.png`, `phoneScreenshots/` (8). Keep only the `.yml`.
3. **Replace the `.yml`** with
   `apps/android/metadata/fdroiddata-submission/com.rootmyandroid.yml`
   (already `rewritemeta`-clean, `Binaries:` block form **with the
   trailing space**, commit `9079ba2…`, version 26.11.25/20261125).
4. **Verify the diff**: `glab api "projects/89251913/repository/compare?from=master&to=com.rootmyandroid"`
   → exactly **1 file**, `metadata/com.rootmyandroid.yml`.
5. **Open the MR** (it was closed; a fresh MR is cleaner than reopening —
   same branch works):
   - title `New app: Root My Android`
   - description = `mr-description.md` verbatim
   - `/label ~"New App"` (must be in the description or added as a label)
6. **Attach the screenshots** as an MR comment (the template asks for
   them): upload via `POST /projects/89251913/uploads` (multipart) and
   post the returned markdown in a note. The 8 PNGs are in
   `fastlane/metadata/android/en-US/phoneScreenshots/`.
7. **Watch the pipeline.** It must go green again — the diff is one file,
   but `fdroid build` re-runs and re-compares against the v26.11.25 asset.

**Gate 11 reminder:** never bump the recipe before the release asset
exists. It exists now, so this ordering is safe.

---

## 3. Why the first attempt failed (do not repeat)

- The MR description was free-form technical prose: no Abstract, no "why",
  no checklist, no label.
- The MR added **13 files** — the template explicitly forbids shipping
  summary/description/images in the MR; they belong in the upstream repo.
- Root cause of the miss: I validated against the *pipeline gates*
  (`docs/FDROID-CHECKLIST.md`, ported from sidecoin) which only cover
  build failures, and never opened fdroiddata's own
  `.gitlab/merge_request_templates/Default.md` or `CONTRIBUTING.md`.
  **Read the template first, every time.**

---

## 4. Second half of the session: review other MRs

Goal is to contribute as a reviewer, not only as a submitter.

- Browse open MRs: https://gitlab.com/fdroid/fdroiddata/-/merge_requests
  (filter `New App`, or the `rfr`/`review needed` labels).
- What is genuinely useful to check (all mechanical, all evidence-based):
  1. **Template followed?** — Abstract + why + checklist + `New app:` title
     + `/label ~"New App"`. This is the most common rejection reason.
  2. **Diff scope** — only `metadata/<appid>.yml` (plus signatures if any).
  3. **Version/commit agreement** — `versionName`/`versionCode` in the
     recipe == `build.gradle` == the tagged commit; `commit` is a full
     40-hex hash, not a tag.
  4. **Single Builds block**, no disabled versions, `CurrentVersion`
     matching.
  5. **Reproducibility** — `Binaries:` + `AllowedAPKSigningKeys:` present
     and the `check apk` job green.
  6. **NonFreeNet / AntiFeatures reasons** present when the app talks to a
     hosted service.
  7. **Store metadata upstream** (fastlane/Triple-T, `en-US` included).
  8. Pipeline green, and any red job's cause is the author's to fix.
- Comment only with reproducible findings, cite the file/line, and never
  claim something without checking the diff. Reviewing is read-only: do
  not push to anyone else's branch (repo rule 9 — sibling repos are
  read-only).

---

## 5. Reference state (unchanged facts)

- **Signing:** upload key `rootmyandroid-upload`,
  `/home/gh-runner/secrets/rootmyandroid-upload.keystore` on blackhost,
  cert SHA-256 `1c59c4331c9c8f1fc0e41578ef47ac404396ba7596f5a4c8e94528d4886bceca`.
  Play App Signing re-signs with Google's key, so Play and F-Droid builds
  carry different signatures (expected; no cross-update without uninstall).
- **The 9 measured pipeline failures and their fixes** — see
  `docs/HANDOFF-2026-11-21-fdroid-mr.md` §3. All are load-bearing:
  `scanignore` entries (`.vendor`, `apps/desktop`, hermesc, 4 library
  `build.gradle`s), `init:` symlinks (react-native, codegen,
  hermes-compiler), `node` instead of `npx` for autolinking, comment-free
  `rewritemeta` output, fdroid metadata filenames, EXIF-stripped images.
- **blackhost:** disk runs near-full (97 %); check `df -h /` before a
  release build and free `/tmp` if a CI job hangs with no gradle process.
- **Pixel 5** (`0C151FDD400648`): currently on the fdroid 26.11.20 build;
  the daily driver is the appstore flavor — `adb push` to
  `/data/local/tmp/` then `pm install -r`.
- **Install path:** browser downloads are RETIRED (owner ruling). Always
  `adb push <apk> /data/local/tmp/ && pm install -r /data/local/tmp/<apk>`.
