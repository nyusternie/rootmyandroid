---
name: Dhizuku
summary: The package name behind Dhizuku — an app that shares DeviceOwner permissions with other apps, published by Rosan.
developer: Rosan (iamr0s)
category: UtilitiesApplication
official: https://github.com/iamr0s/Dhizuku
source: https://github.com/iamr0s/Dhizuku/releases
license: GPL-3.0
system: false
profile: /Dhizuku
related:
  - href: /guardian-angel
    label: Guardian Angel — device administrator, explained
  - href: /ADB
    label: ADB — the shell on a phone
  - href: /rooting
    label: How rooting works
checked: 26 Nov 2026
---

`com.rosan.dhizuku` is the application ID of **Dhizuku**, an Android app that
shares the privileges of a device owner with other apps. The project describes
itself as "a tool that can share DeviceOwner permissions to other application".

## What the package is, and what it is not

Android gives a *device owner* — an app installed as the device's administrator
of record — powers that ordinary apps do not have: installing and uninstalling
packages silently, changing device policies, and managing other apps. Dhizuku
does not grant those powers to itself. It exposes the ones the device owner
already has to apps that ask for them, through its own API.

That means Dhizuku is only useful on a device where a device owner has been
established. Without one, the app has nothing to share.

## Where the package name shows up

- App lists and device reports, next to the label "Dhizuku".
- `adb shell dumpsys package com.rosan.dhizuku` prints version, signature and
  install source.
- Device-administrator listings: a Dhizuku installation is usually paired with
  an active administrator entry, which is what a monitoring or management setup
  looks like from the outside.

## If you did not install it

A phone with Dhizuku is a phone someone manages deliberately — it is a tool for
device administration, not something that arrives with an app install. If you
are auditing a device you own and do not recognise it, check the device
administrators list in Settings first; removing the app without removing the
administrator can leave the device in a state where the managing app can no
longer be uninstalled through the normal UI.

## How to check it on your own phone

```
adb shell pm list packages | grep dhizuku
adb shell dumpsys package com.rosan.dhizuku | head -40
```

The [device scan](/scan) performs the same read-only lookup in the browser over
USB, and [Guardian Angel](/guardian) keeps a device's shared app list browsable.
The [Dhizuku profile](/Dhizuku) covers setup and removal.
