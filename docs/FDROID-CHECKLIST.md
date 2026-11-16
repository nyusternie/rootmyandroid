# F-Droid submission checklist — the 11 gates

Port of the sidecoin post-MR-50457 gate list (sidecoin AGENTS.md, 2026-11)
into this repo (owner request: "port the 11-gate checklist into our
docs/CI"). Every item maps to a reviewer comment that cost a full review
round; run ALL of them before pushing a recipe update or answering a
tester review. Nothing here is optional and nothing here runs from memory.

Run order is not significant except where noted (gate 11 is a hard
sequencing rule).

1. **Exactly ONE `Builds` block — the latest.** F-Droid builds and
   publishes EVERY entry in `Builds:`; a stale block ships a stale APK.
   Verify: `grep -c 'versionName:' apps/android/metadata/com.rootmyandroid.yml`
   == 1, and that block's versionName/versionCode/commit match
   `apps/android/android/app/build.gradle` `defaultConfig` + the peeled
   release tag (`git rev-parse vX.Y.Z^{}`).

2. **The maintenance copy MUST be bumped in the SAME change as the version
   bump.** Nothing enforces the pairing by accident. Verify
   versionName/versionCode/commit/CurrentVersion* in
   `apps/android/metadata/com.rootmyandroid.yml` match
   `apps/android/android/app/build.gradle` + `apps/android/package.json` +
   the release tag.

3. **Re-verify hosted-binary facts against the actual asset each release.**
   `curl -sL` the v-tag `app-fdroid-release.apk`, record the REAL byte size
   + sha256 into the recipe comment — never copy a prior version's numbers.
   (`curl -sIL` first for the 200 + content-length; the sha256 must equal
   the CI run's published asset.)

4. **`fdroid rewritemeta com.rootmyandroid` → zero parsed-content diff**
   before every recipe push. Enforced by CI:
   `.github/workflows/fdroid-gate.yml` (installs fdroidserver into a
   throwaway venv, rewrites, compares parsed YAML before/after). Comments
   are exempt — fdroiddata strips them by design.

5. **Cross-check the listing against the app before submitting.** Walk
   `apps/android/android/app/src/fdroid/play/listings/en-US/full-description.txt`
   line by line against the REAL screens (`apps/android/src/screens/`) —
   every named feature must exist and be reachable on the fdroid flavor,
   every count must match the code. Sidecoin's reviewers caught a
   "Deposit/withdraw" claim on `Pressable`s with no `onPress`, a
   "10 live sidechains" that disagreed with the code's 11 entries, and an
   undescribed WebView browser — three separate ways in one round.

6. **Defer maintainer-side questions to the maintainers.** If a reviewer
   asks for an upstream fdroidserver change or flags a scanner behavior
   outside our tree, note it and wait — do not "fix" it unilaterally
   (sidecoin's Skia `.a` scanignore question, linsui).

7. **Flavor-scoped string audit — grep, never memory.** After ANY flavor
   sweep, enumerate EVERY user-visible paid-tier string that renders when
   `IS_FDROID_BUILD === false`, and gate or reword each one:
   `grep -rn 'PRO\b\|Upgrade\|Top up\|time credit\|Guru' apps/android/src/`
   — every hit must be behind `!IS_FDROID_BUILD` or flavor-conditional.
   Sidecoin's sweep gated components but never grepped strings, so two PRO
   mentions survived in Settings while the commit message claimed "no PRO
   mention anywhere" (never write that claim without the grep proving it —
   repo rule 3: no guessing).

8. **Enumerate self-rooted screens; verify insets on API 35+.** Maintain
   the list of screens that do NOT use the shared screen primitive by
   grep, not memory. targetSdk 35 enforces edge-to-edge on Android 15+;
   overlap bugs do NOT reproduce on the Android 14 test device (redfin) —
   verify insets on an API-35+ emulator or device before claiming fixed.

9. **Post-flavor-change walkthrough of every newly-unlocked screen.**
   Removing a gate changes what a fresh user sees — walk each
   newly-reachable screen for placeholder data; placeholders must be honest
   ("—" + "not connected yet"), never transplanted literals. (📱 Pixel 5
   item — this walkthrough happens on the device.)

10. **Dead-control sweep — no `<Pressable>` without `onPress` unless
    `disabled`.** A control that renders tappable but does nothing is the
    recurring finding (mezinster, twice). Verify with a scripted sweep over
    the screens/components tree; each dead control must be `disabled` and
    carry an explanatory note.

11. **Release sequencing — push the fdroiddata recipe LAST.** The MR
    pipeline downloads `Binaries:` at the END of an otherwise successful
    build. Sequence: bump + tag + push master → CI builds → GitHub release
    + asset upload → `curl -sIL` the v%v URL for 200 + content-length →
    ONLY THEN bump + push fdroiddata. A 404 here costs a full pipeline
    round (~25 min). android.yml's tag trigger publishes the exact asset
    name on tag push — never rename via `file#label`.
