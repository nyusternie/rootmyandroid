# Review procedure — phases with exact commands

Every phase is read-only against fdroiddata. The only write is the single
report comment at the end. Timeouts stay ≤ 60 s; poll in tight bursts.

## Phase 0 — refresh the rules

```bash
glab api "projects/fdroid%2Fwiki/wikis/Tips-for-fdroiddata-contributors%2FReviewing-new-apps" \
  | jq -r .content > /tmp/wiki-review.md
```

Read it. If it disagrees with this suite, the wiki wins and `pitfalls.md` gets
an entry.

## Phase 1 — pick candidates

```bash
.agents/skills/fdroid-review/tools/pool.sh 25        # ranked by note count
.agents/skills/fdroid-review/tools/vet.sh 58329      # one candidate, full vetting
```

`vet.sh` prints: MR state, head pipeline, non-system note authors each marked
`MAINTAINER` or `OUTSIDER`, and a verdict line. Candidates with an `OUTSIDER`
comment have already been reviewed by a community tester — skip them.

Also skip when a maintainer's note is an open request to the author ("use the
full commit hash", "setup abi split", "choose a better category"): the MR is
not ready for a device. Pipeline must be green.

## Phase 2 — the APK

```bash
.agents/skills/fdroid-review/tools/mr-apk.sh 58329
```

What it does and why it matters:

- The `fdroid build` artifact contains `tmp/<pkg>_<code>.apk` (**unsigned** —
  `fdroid publish` implants the signature later) and
  `tmp/binaries/<pkg>_<code>.binary.apk` (**the developer reference binary**,
  which is byte-identical to what publish ships).
- Install the reference binary and verify its certificate SHA-256 against the
  recipe's `AllowedAPKSigningKeys`. The tool prints the comparison.
- Never install the upstream release APK: it is not what this MR ships.

If the artifact has expired (404), the job trace still carries the report and
the `fdroid build` trace still carries the byte-compare line.

## Phase 3 — static pass on that APK

```bash
AAPT=$(ls -d /Workspace/Android/Sdk/build-tools/*/ | sort -V | tail -1)aapt2
"$AAPT" dump badging <apk> | head -6              # package, version, minSdk
unzip -l <apk> | grep -oE 'lib/[^/]+/' | sort -u   # per-ABI inventory
unzip -qo <apk> 'classes*.dex' -d /tmp/x
cat /tmp/x/classes*.dex | strings | grep -oE 'https?://[a-zA-Z0-9._-]+' | sort -u
cat /tmp/x/classes*.dex | strings \
  | grep -ioE '[a-z0-9._/]{0,30}(firebase|appsflyer|adjust|amplitude|mixpanel|onesignal|sentry|bugsnag|crashlytics)[a-z0-9._/]{0,30}' \
  | sort -u
```

Tracker hits are usually false positives (`fontWeightAdjustment`,
`SelectionBoundsAdjuster`, `adjustMetaAfterKeypress`): quote the matched symbol
in the report, never just the count. Flutter keeps URLs in `libapp.so`
(Dart AOT), not in the dex.

## Phase 4 — Code Quality

```bash
.agents/skills/fdroid-review/tools/codequality.sh 36528 <pipeline_id>
```

Prints every `generate_report` entry as `CATEGORY :: description`, then a
verdict. Read it before the device: it is where the permissions list and the
APK URL come from. Known-informational categories: `abi_size`,
`application_attribution`, `permission`, `signing_key`, and `r8_marker` when
the marker is present. Anything else is printed as `CHECK` and must be
explained in the report.

## Phase 5 — device

```bash
adb devices -l                                   # note model + Android version
adb install -r <reference-binary.apk>
```

Start PCAPdroid **before** the first launch, for `INTERNET` apps:

```bash
adb shell monkey -p com.emanuelef.remote_capture -c android.intent.category.LAUNCHER 1
# tap Start (VPN consent once), confirm the button now reads Stop
```

Then launch the app under test, exercise the described functions, and read the
capture filtered by the app's label (toolbar → Search → app name). `No matches`
is a finding, not a failure: it means zero connections.

UI driving is `uiautomator dump` + `input tap`; never screenshot into context.
Compose text fields may have no `EditText` until focused; `content-desc` is
often the only label. Long presses need `input motionevent DOWN/UP`, not
`input swipe` with identical coordinates.

## Phase 6 — permissions on use

Refuse every optional runtime permission and check the app still works:

```bash
adb shell dumpsys package <pkg> | grep -E "(CAMERA|RECORD_AUDIO): granted"
```

The permission must be requested only when its feature is used, and a refusal
must degrade gracefully. Record both the dialog text and the fallback text.

## Phase 7 — crash sweep and cleanup

```bash
adb logcat -d | grep -c 'FATAL EXCEPTION'
adb logcat -d | grep -ci 'ANR in'
# stop PCAPdroid (tap Stop), verify the VPN is gone
adb shell dumpsys connectivity | grep -ic 'VPN CONNECTED'
```

## Phase 8 — report

Compose from `report-template.md`. Before posting, run the `pitfalls.md`
checklist. Post ONE comment per MR; if you must correct your own comment,
update it in place (`PUT .../notes/<id>`) instead of adding a second.

Then append `rounds/YYYY-MM-DD.md`.
