# HANDOFF — F-Droid MR !58356 (2026-11-21)

**Next session's mission: follow MR !58356 until merge, then verify the
package is live.** Everything in-repo is done and green; what remains is
reviewer interaction.

---

## 1. Where things stand (verified at session end)

| Item | Value |
|---|---|
| **MR** | https://gitlab.com/fdroid/fdroiddata/-/merge_requests/58356 — state `opened`, **pipeline `success`** (pipeline `3096861959`, sha `0e8b7e67`) |
| **Fork** | `gitlab.com/nyusternie/fdroiddata`, project id **89251913**, branch `com.rootmyandroid` |
| **Release** | `v26.11.24`, commit `4d9231092907465b8aa6327992338b2ff47a09f9` |
| **Asset** | `app-fdroid-release.apk` — 17,993,304 bytes, HTTP 200 at `releases/download/v26.11.24/…` |
| **Signing** | upload key, cert SHA-256 `1c59c4331c9c8f1fc0e41578ef47ac404396ba7596f5a4c8e94528d4886bceca` (pinned as `AllowedAPKSigningKeys` in both recipe copies) |
| **App repo** | `/Workspace/hos/rootmyandroid`, `master`, GitHub `nyusternie/rootmyandroid` + mirror `gitlab.com/nyusternie/rootmyandroid` |
| **Recipe (maintenance)** | `apps/android/metadata/com.rootmyandroid.yml` |
| **Recipe (authoritative)** | `metadata/com.rootmyandroid.yml` in the fork branch — **comment-free, exactly rewritemeta output** |

All 9 jobs green: `schema validation`, `check source code`, `tools check
scripts`, `fdroid rewritemeta`, `fdroid lint`, `git redirect`,
`checkupdates`, **`fdroid build`**, **`check apk`**.

`check apk` = F-Droid rebuilt our app from source on their buildserver and
byte-compared it against our hosted binary — it matched, so the
upstream-signed route (a) is proven end-to-end.

---

## 2. What happens next (no owner input needed yet)

1. **Review queue.** linsui reviews first, then testers walk every screen.
   Sidecoin took ~7 weeks from first MR to merge; ours is a smaller app.
2. **On a reviewer note:** reproduce → fix on `master` → `pnpm test` via CI
   → **tag a new release** (`v26.11.NN`) → wait for the asset → bump the
   recipe (`versionName`, `versionCode`, `commit`, `CurrentVersion*`) →
   push to the fork branch. NEVER bump the recipe before the asset exists
   (gate 11 — a 404 costs a full 25-minute round; it happened tonight).
3. **Before replying to ANY tester finding:** run the self-audit sweep —
   `node apps/android/tools/check-dead-controls.mjs`, the gate-7 PRO-string
   grep, and a fresh `uiautomator` dump if the finding is UI-related.
4. **After merge:** `curl https://f-droid.org/api/v1/packages/com.rootmyandroid`
   (404 until the buildbot publishes). Then set up the recurring release
   protocol.

---

## 3. The nine failures this session — all fixed, all measured

Do not "re-fix" these; they are load-bearing.

| # | Symptom | Cause | Fix (where) |
|---|---|---|---|
| 1 | scanner: 4 errors | `.vendor/*.tgz` gzip; `apps/desktop/src-tauri/Cargo.toml` no lock; wrong node_modules path | `scanignore` in recipe |
| 2 | `rewritemeta` diff | CI compares TEXT; comments stripped | push rewritemeta output; `Binaries:` block form **with trailing space** |
| 3 | `tools check scripts` | localized metadata filenames | `name.txt` / `summary.txt` / `description.txt` (fdroiddata copy only) |
| 4 | `check-exif-in-images.sh` | ICC/EXIF in PNGs | `convert -strip` on all 9 images (also in the app repo) |
| 5 | `npx` exit 1 | offline, TTY-less VM | `settings.gradle` calls the CLI as `node <cli>/build/bin.js config` |
| 6 | `No package name found` (lottie) | fdroidserver deleted 3 libraries' `build.gradle` (local maven URLs) → `namespace` lost | `scanignore` all three + react-native's `publish.gradle` |
| 7 | `ReactAndroid/gradle.properties` missing | RN resolves from the APP-local node_modules; hoisted install only has the workspace root | recipe `init:` symlinks `react-native`, `@react-native/codegen`, `hermes-compiler` |
| 8 | `Couldn't determine Hermesc location` | scanner deleted the hermesc binary | `scanignore node_modules/hermes-compiler/hermesc/linux64-bin/hermesc` |
| 9 | `Unexpected versionCode … '20261121' expected '20261124'` | recipe `commit:` pointed at the previous release | commit + versionName/versionCode must be bumped together |

---

## 4. Operational notes (learned the hard way tonight)

- **blackhost disk hit 97 % and the CI job HUNG** — the job sat
  `in_progress` for 50 minutes with no gradle process. Cancel it, free
  `/tmp`, `systemctl restart actions.runner.nyusternie-rootmyandroid.blackhost-web.service`,
  re-run. Check `df -h /` before any release build.
- **Host↔blackhost transfers degrade intermittently** (§0). Workaround
  that worked repeatedly: `split -b 6000000` on blackhost, `scp` each part,
  `cat` locally, verify sha256 before every `adb push`.
- **fdroiddata pipeline rounds are ~25 min** and each round is one fix.
  Read the job trace, never guess: `glab api "projects/89251913/jobs/<id>/trace"`.
- **A temporary probe in `settings.gradle`** is what finally revealed the
  lottie/namespace failure — when Gradle hides a subprocess's stderr,
  print it yourself rather than guessing at causes.
- **Secrets:** the keystore + properties live on blackhost
  (`/home/gh-runner/secrets/`, mode 0600). Never echo their values.
  *Superseded 2026-11-23:* AGENTS rule 11 now requires a mirror copy on
  `apecsdev` as well — blackhost alone is a single point of loss.

---

## 5. Device state (Pixel 5, serial `0C151FDD400648`)

Currently running the **fdroid `v26.11.20`** build (installed to capture a
billing-chip-free screenshot). The owner's daily driver is the **appstore**
flavor — restore it when convenient:

```
adb push <appstore apk> /data/local/tmp/rma-dd.apk
adb shell pm install -r /data/local/tmp/rma-dd.apk
```

Both flavors share appId + signature, so `-r` swaps them either way. The
phone is NOT needed for MR follow-up unless a tester reports a UI issue.

---

## 6. Listing copy (final, shipped in the MR)

- **name:** `Root My Android`
- **summary (68/80):** `Every Android deserves a cape — learn how to release its FULL power.`
- **description:** 3,496/4,000 — opens with the summary line, then Device
  scan / Backup audit / Encrypted backups / Device pairing by QR / Tools /
  Your account, then DESIGNED FOR SAFETY, MIT + no-billing note, and the
  NonFreeNet explanation.
- **screenshots:** 8, all captured on the fdroid build (no billing chip),
  9:16, metadata stripped.

Every claim in the description was re-verified against the tree before
writing — keep that discipline if the copy changes.
