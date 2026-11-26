---
name: APatch
summary: The package name behind APatch — kernel patching for Android root, published by bmax121.
developer: bmax121
category: UtilitiesApplication
official: https://github.com/bmax121/APatch
source: https://github.com/bmax121/APatch/releases
license: GPL-3.0
system: false
profile: /APatch
related:
  - href: /Magisk
    label: Magisk — boot-image root
  - href: /KernelSU
    label: KernelSU — kernel-module root
  - href: /rooting
    label: How rooting works
checked: 26 Nov 2026
---

`me.bmax.apatch` is the application ID of the **APatch** manager. The project
describes itself as "the patching of Android kernel and Android system": it
patches the kernel binary of a stock boot image instead of requiring a kernel
built for root.

## What the package is, and what it is not

The APatch app is the manager and the patcher. You give it a stock boot image,
it produces a patched one, and you flash that. Root then comes from the patched
kernel rather than from a kernel module that was compiled in — the difference
between APatch and [KernelSU](/KernelSU) is where the hook lives, not what the
end result looks like.

The project builds on KernelPatch, its own kernel-patching layer. Because the
patch is applied to the kernel you already run, APatch does not need a
custom-built kernel for your device — but it does need a boot image that
matches your exact build.

## Where the package name shows up

- App lists and device reports, next to the label "APatch".
- `adb shell dumpsys package me.bmax.apatch` prints version, signature and
  install source.
- A device can carry APatch and another root manager at once; the package names
  are what tell them apart.

## If you did not install it

An APatch manager means the kernel on that phone was patched. Kernel patches do
not survive a stock firmware update, so a device can end up in a mixed state:
new system, patched old kernel, or the reverse. Before removing anything, note
the exact build number — the [device pages](/device) list boot images per model
and the [rooting guide](/rooting) explains how to restore a stock boot image
safely.

## How to check it on your own phone

```
adb shell pm list packages | grep apatch
adb shell dumpsys package me.bmax.apatch | head -40
```

The [device scan](/scan) performs the same read in the browser over USB without
writing anything, and [Guardian Angel](/guardian) keeps the shared app list for
a device. The [APatch profile](/APatch) covers the patching workflow.
