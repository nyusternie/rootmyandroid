---
name: Root My Android
summary: The package name of the Root My Android phone app — device scan, backup audit and account tools for this site.
developer: Root My Android
category: UtilitiesApplication
official: https://rootmyandroid.com/
source: https://rootmyandroid.com/downloads
license: MIT
system: false
related:
  - href: /downloads
    label: Download the Root My Android app
  - href: /scan
    label: The read-only device scan (no install needed)
  - href: /account
    label: Your account and devices
checked: 26 Nov 2026
---

`com.rootmyandroid` is the application ID of the **Root My Android** phone app,
the companion to this site. It is our own package, so this page is also the
short answer to "what is this app that appeared on my phone?".

## What the app does

- **Device scan** — reads `getprop` and package information from the phone and
  reports it. Read-only: the scan never writes to the device, never flashes
  anything and never requests `su`.
- **Backup audit** — reports which installed apps allow Android's backup
  mechanism (`PackageManager.allowBackup`), which is the part of a backup plan
  people usually cannot see.
- **Account tools** — pairing with an account number, and syncing the audits you
  choose to save. Nothing is uploaded until you save it to an account.

The app ships in two flavours from the same source: an F-Droid build and a Play
build. Both use the same application ID, so a device carries one of them, not
both.

## Where the package name shows up

- App lists and device reports, next to the label "Root My Android".
- `adb shell dumpsys package com.rootmyandroid` prints version, signature and
  install source.
- The QR pairing flow: the app scans a pairing URL from this site, which is how
  an account and a device meet.

## Privacy, in one paragraph

The scan runs on the phone. Nothing leaves the device until you save a report to
an account number, and the account number is the only identifier we hold — no
email, no phone number. The [privacy page](/privacy) states the same thing in
full, and [Guardian Angel](/guardian-angel) covers the monitoring product
separately.

## How to check it on your own phone

```
adb shell pm list packages | grep rootmyandroid
adb shell dumpsys package com.rootmyandroid | head -40
```

The browser-based [device scan](/scan) does the same read without installing
anything, and the [downloads page](/downloads) has the current APK.
