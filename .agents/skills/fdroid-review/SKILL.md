# F-Droid community review — the official tester procedure

Source of truth: **https://gitlab.com/fdroid/wiki/-/wikis/Tips-for-fdroiddata-contributors/Reviewing-new-apps**
(fetch it before any review — it changes). This skill is a snapshot plus the
hard rules learned the expensive way.

## Which MRs to review

- Pool: `review-requested` (the label a maintainer adds *after* triage). It is
  NOT `New App` — that one only means the MR exists.
- Pick the ones with the **fewest notes**. "No outside review" means **no
  non-maintainer comment**: check `projects/36528/members/all?query=<user>`;
  a username that returns nothing is a community tester, and the app has
  already been device-tested.
- Pipeline must be green before you spend a device on it.

## Hard rules (each one was a real failure)

1. **Network monitoring is not optional.** If the app declares `INTERNET`, start
   PCAPdroid (or equivalent) **before** opening the app. `ss -tn` samples and
   `strings` on the binary are *not* a network check — they miss short-lived
   connections. Report only what the capture shows.
2. **Use the official report template.** Freeform prose is not a review. The
   template's rows are: Basic Function / Policy Compliance / Permissions /
   Network Connections / Language Support / Security Scan.
3. **Every row gets answered.** Icon, terms, English support, in-app webview,
   `MANAGE_EXTERNAL_STORAGE`, optional runtime permissions, update check.
   "Not checked" is a gap, not a finding.
4. **No meta-commentary.** A review discusses the app, never the reviewer's
   process, never a previous version of the comment.
5. **Ask, don't assert, on policy.** `NonFreeNet` is a judgement call: present
   the evidence (hosts, code paths) and the label suggestion; the maintainer
   decides.
6. **No device wipes.** `adb uninstall` the test package only; restore any
   system setting you toggled (accessibility, notification listeners).

## Procedure

```bash
# 1. APK: the MR's own `fdroid build` artifact, never the upstream release
jid=$(glab api "projects/<source_project>/pipelines/<id>/jobs?per_page=100" \
      | jq -r '.[]|select(.name=="fdroid build")|.id')
glab api "projects/<source_project>/jobs/$jid/artifacts" > /tmp/app.zip
unzip -q /tmp/app.zip -d /tmp/appart && find /tmp/appart -name '*.apk'

# 2. static pass on THAT apk
aapt2 dump badging <apk> | head -5
unzip -l <apk> | grep 'lib/.*\.so'          # per-ABI inventory
unzip -p <apk> lib/arm64-v8a/libapp.so | strings | grep -oE 'https?://[a-z0-9.-]+' | sort -u
#   Flutter: URLs live in libapp.so (Dart AOT), NOT in classes.dex
cat classes*.dex | strings | grep -icE 'firebase|appsflyer|adjust|amplitude|mixpanel|onesignal|sentry|bugsnag|crashlytics'

# 3. network capture BEFORE launch
adb install -r <apk>
adb shell monkey -p com.emanuelef.remote_capture -c android.intent.category.LAUNCHER 1
#   tap Start (VPN consent once), then launch the app under test
adb shell monkey -p <pkg> -c android.intent.category.LAUNCHER 1 && sleep 20
#   read the CONNECTIONS tab with uiautomator (text nodes are readable)

# 4. exercise it, then read logcat
adb logcat -d --pid=$(adb shell pidof <pkg>) | grep -iE 'fatal|exception|anr'
```

PCAPdroid UI notes: the toolbar buttons are `content-desc`, not `text` —
`Start`/`Stop` sit at ~`[683,147][837,279]` on a 1080×2340 screen; the
Connections tab is at `[540,290][1080,422]`.

Flutter apps expose no accessibility tree to `uiautomator` unless a screen
reader is bound. Do not fake it with TalkBack (its training wall blocks the
device); drive what you can, and state plainly which functions you could not
reach.

## Report template

```md
| Category | Checklist |
|---|---|
| **Basic Function** | ✅ starts and runs · ✅ <functions verified> · ✅ custom icon |
| **Policy Compliance** | ✅ no Inclusion-Policy violation · ✅ `Categories:` · ✅ no extra terms |
| **Permissions** | ✅ no `MANAGE_EXTERNAL_STORAGE` · ✅ optional runtime permissions are optional |
| **Network** | ✅/⚠️ <what the capture showed, per host> |
| **Language** | ✅ English |
| **Security scan** | ⚠️ not run (VirusTotal) |

<recipe findings, each with file:line>
```

## Posting

- One comment per MR. Update your own comment with `PUT
  /projects/:id/merge_requests/:iid/notes/:note_id` rather than adding a second.
- Never edit the MR description, never touch labels, never merge.
- The author reads this: every claim needs a file, a line, or a capture entry.
