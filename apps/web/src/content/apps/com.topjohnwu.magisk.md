---
name: Magisk
summary: The package name behind Magisk — the systemless root manager for Android, published by topjohnwu (John Wu).
developer: topjohnwu (John Wu)
category: UtilitiesApplication
official: https://github.com/topjohnwu/Magisk
source: https://github.com/topjohnwu/Magisk/releases
license: GPL-3.0
system: false
profile: /Magisk
related:
  - href: /rooting
    label: How rooting works, and what it costs you
  - href: /device
    label: Device pages — boot images and recovery per model
  - href: /KernelSU
    label: KernelSU — the kernel-side alternative
  - href: /APatch
    label: APatch — kernel patching without a custom kernel
checked: 26 Nov 2026
---

`com.topjohnwu.magisk` is the application ID of **Magisk**, the Android root
manager written by John Wu. If you found this string in an app list, a device
report, or `adb shell pm list packages`, it is the Magisk manager app — the
user-facing half of a root installation.

## What the package is, and what it is not

The manager app is ordinary: it is installed like any other APK, it appears in
the launcher, and it can be uninstalled like any other app. The root itself
does not live in the app. Magisk patches the device's **boot image**, and the
patched boot image is what grants root; the manager is the console you use to
supervise it.

That separation is the whole design. Magisk's own description calls it
"systemless": it modifies the boot image and mounts its changes over the system
partition instead of rewriting `/system`. A factory reset or a stock boot image
restores the device, which is why Magisk installations are usually described as
reversible.

## Where the package name shows up

- **App lists and device reports** — `com.topjohnwu.magisk` next to the app
  label "Magisk".
- **Package queries** — `adb shell dumpsys package com.topjohnwu.magisk` prints
  the installed version, the signing certificate and the install source.
- **Update checks** — the manager updates itself through its own release
  channel, not the Play Store; the package name stays the same across updates.

## If you did not install it

A phone with Magisk on it was rooted by someone: the owner, a repair shop, or a
previous owner of a second-hand device. Root changes the security model of the
device — apps that detect it may refuse to run, and a device-management profile
(a school or employer MDM) may treat the device as compromised. If the phone is
not yours to modify, do not remove the manager yourself: removing the app does
not remove root, and removing root incorrectly can leave the device unable to
boot.

## How to check it on your own phone

With a USB cable and ADB, read-only:

```
adb shell pm list packages | grep topjohnwu
adb shell dumpsys package com.topjohnwu.magisk | head -40
```

No cable? The [device scan](/scan) reads the same information over USB from the
browser and writes nothing to the phone, and [Guardian Angel](/guardian) keeps
the app list a device shares with your account.

## Magisk versus the other root methods

Magisk patches the boot image of the kernel you already run. [KernelSU](/KernelSU)
moves root into a kernel module and needs a kernel built with it, and
[APatch](/APatch) patches the kernel binary directly. All three end in the same
place — a `su` binary the system trusts — and all three are detected by apps
that check for root. The [full Magisk profile](/Magisk) covers installation,
modules and removal in depth.
