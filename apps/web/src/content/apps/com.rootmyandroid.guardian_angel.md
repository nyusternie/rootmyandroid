---
name: Guardian Angel
summary: The package name of the Guardian Angel app — the monitoring companion for a family device, paired to an account number.
developer: Root My Android
category: UtilitiesApplication
official: https://rootmyandroid.com/guardian-angel
source: https://rootmyandroid.com/downloads
license: MIT
system: false
related:
  - href: /guardian
    label: Open the Guardian control page
  - href: /guardian-angel
    label: What Guardian Angel is
  - href: /privacy
    label: Privacy policy
checked: 26 Nov 2026
---

`com.rootmyandroid.guardian_angel` is the application ID of **Guardian Angel**,
our monitoring app for a phone you are responsible for. It is a separate install
from the [Root My Android app](/app/com.rootmyandroid) and pairs to the same
account number.

## What the app does

- **Pairs to an account** — a 16-digit account number, no email address. One
  account covers up to five devices.
- **Shares an app list** — package name, label and version for the apps
  installed on the phone, once per launch and after each sync. That list is what
  the [Guardian control page](/guardian) shows, per device.
- **Offers device administrator** — the standard Android mechanism that makes an
  app harder to uninstall without consent. It is off until it is turned on in
  the app.

Monitoring is deliberately narrow today: the app list is the first slice, and
what else is collected is a product decision that has not been made — the
open questions are recorded in the repo rather than guessed at in the UI.

## Where the package name shows up

- App lists and device reports, next to the label "Guardian Angel".
- `adb shell dumpsys package com.rootmyandroid.guardian_angel` prints version,
  signature and install source.
- Device-administrator listings, when protection has been enabled.

## If you did not install it

This app is installed by whoever set the phone up, and it is meant to be
visible: the app posts its own notification so it can be opened, and the
control page lists the devices on the account. If you are the device owner and
do not recognise it, the account number on the phone is what ties it to a
person — the [Guardian page](/guardian) explains what the account can see.

## How to check it on your own phone

```
adb shell pm list packages | grep guardian
adb shell dumpsys package com.rootmyandroid.guardian_angel | head -40
```

The browser-based [device scan](/scan) reads the same information without
installing anything.
