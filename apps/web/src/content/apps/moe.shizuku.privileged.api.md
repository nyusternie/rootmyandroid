---
name: Shizuku
summary: The package name behind Shizuku — a privileged helper process that lets ordinary apps use system APIs, published by RikkaApps.
developer: RikkaApps
category: UtilitiesApplication
official: https://github.com/RikkaApps/Shizuku
source: https://github.com/RikkaApps/Shizuku/releases
license: Apache-2.0
system: false
profile: /Shizuku
related:
  - href: /ADB
    label: ADB — what the shell can and cannot do
  - href: /rooting
    label: How rooting works
  - href: /guardian
    label: Guardian Angel — the app list a device shares
checked: 26 Nov 2026
---

`moe.shizuku.privileged.api` is the application ID of **Shizuku**, a helper that
runs a process with shell (or root) privileges and lets ordinary apps call
system APIs through it. The project describes it as "using system APIs directly
with adb/root privileges from normal apps".

## What the package is, and what it is not

Shizuku is not a root manager. It starts a privileged process — via ADB on a
non-rooted device, or via root when root exists — and apps that support Shizuku
talk to that process instead of asking for root themselves. The app on the phone
is the console: it shows whether the service is running and how it was started.

That distinction matters when you are reading an app list. A device with
Shizuku installed is not necessarily rooted; a device with Shizuku *running* has
either a USB/ADB session or root behind it.

## Where the package name shows up

- App lists and device reports, next to the label "Shizuku".
- `adb shell dumpsys package moe.shizuku.privileged.api` prints version,
  signature and install source.
- Supporting apps often name Shizuku in their own requirements, which is how
  most people meet the package name in the first place.

## About this site and Shizuku

Root My Android documents the package because people look it up, but we do not
ship it, bundle it or require it: our own tools use their own transports
(wireless ADB in Rootz, the relay daemon, and the browser's WebUSB scan). If you
are looking for what our apps need, see [Rootz](/rootz) and the
[device scan](/scan).

## How to check it on your own phone

```
adb shell pm list packages | grep shizuku
adb shell dumpsys package moe.shizuku.privileged.api | head -40
```

The [device scan](/scan) reads the same information over USB in the browser
without writing to the device, and [Guardian Angel](/guardian) keeps the app
list a phone has shared. The [Shizuku profile](/Shizuku) covers how the
privileged process is started and stopped.
