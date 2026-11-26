---
name: KernelSU
summary: The package name behind KernelSU — kernel-based root for Android, published by tiann (Weishu).
developer: tiann (Weishu)
category: UtilitiesApplication
official: https://github.com/tiann/KernelSU
source: https://github.com/tiann/KernelSU/releases
license: GPL-3.0
system: false
profile: /KernelSU
related:
  - href: /Magisk
    label: Magisk — boot-image root
  - href: /APatch
    label: APatch — kernel patching
  - href: /rooting
    label: How rooting works
checked: 26 Nov 2026
---

`me.weishu.kernelsu` is the application ID of the **KernelSU** manager, the
Android app that supervises a KernelSU root installation. The project describes
itself as "a kernel based root solution for Android": root is implemented in a
kernel module rather than by patching the boot image.

## What the package is, and what it is not

Like Magisk's manager, the KernelSU app is a console, not the root itself. The
root lives in the kernel: the device must run a kernel built with the KernelSU
module. That is the trade — KernelSU asks you to flash a kernel that supports
it, and in exchange root is granted from kernel space.

KernelSU targets GKI (Generic Kernel Image) devices, the kernel model Android
adopted from Android 12 onward. A device whose kernel is not built with the
module cannot run it, no matter what the manager app says.

## Where the package name shows up

- App lists and device reports, next to the label "KernelSU".
- `adb shell dumpsys package me.weishu.kernelsu` prints version, signature and
  install source.
- Debug builds of the manager use a separate package name
  (`me.weishu.kernelsu.pr`), so a device can carry both.

## If you did not install it

A KernelSU manager on a phone means someone flashed a custom kernel to that
device. That is a deeper modification than installing an app: the kernel is
part of the boot chain. Do not flash a stock kernel or uninstall the manager to
"clean up" unless you have the matching stock boot image for that exact model
and build — the [device pages](/device) list boot images and recovery per
model, and the [rooting guide](/rooting) explains the order of operations.

## How to check it on your own phone

```
adb shell pm list packages | grep kernelsu
adb shell dumpsys package me.weishu.kernelsu | head -40
```

The [device scan](/scan) does the same read over USB from the browser, and
[Guardian Angel](/guardian) keeps a device's shared app list browsable per
account. The [KernelSU profile](/KernelSU) covers the kernel side in depth.
