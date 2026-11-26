---
name: PCAPdroid
summary: The package name behind PCAPdroid — a no-root network capture app that logs, inspects and exports the connections other apps make.
developer: Emanuele Faranda
category: UtilitiesApplication
official: https://emanuele-f.github.io/PCAPdroid
source: https://github.com/emanuele-f/PCAPdroid
license: GPL-3.0-or-later
system: false
related:
  - href: /scan
    label: The read-only device scan — what it reads, and what it never touches
  - href: /guardian
    label: Guardian Angel — the app list a device shares with your account
  - href: /apps
    label: Every package page on this site
checked: 26 Nov 2026
---

`com.emanuelef.remote_capture` is the application ID of **PCAPdroid**, an
Android app that records what the other apps on the device connect to. If you
found this string in a package list, a device report, or
`adb shell pm list packages`, it is the capture app — not a system component.

## What the package is, and what it is not

PCAPdroid describes itself as "a privacy-friendly open source app which can
track, analyze and block the connections made by the other apps on the
device". It produces packet captures (PCAP files), inspects HTTP requests,
and can decrypt TLS traffic for analysis.

The mechanism is worth understanding, because it explains the thing people
notice first. PCAPdroid **simulates a VPN** in order to see the traffic, which
is how it captures **without root**. It is not a VPN service: the project
states it "does not use a remote VPN server, instead data is processed
locally on the device". So the VPN key in the status bar during a capture is
the local capture loop, not a tunnel to somebody's server.

Two consequences follow:

- **Installing it does not mean the phone is rooted.** Root is not required
  to capture. On a rooted device the app can additionally capture while
  another VPN app is running — a capability the project lists separately,
  which is a sign that it is the exception, not the requirement.
- **It sees the traffic of other apps.** That is the entire point of a
  capture app, and it is also why the app is worth a second look if you did
  not install it yourself.

Some features are paid, per the project's own feature list: a firewall that
blocks apps, domains and IP addresses; malware detection driven by third-party
blacklists; and the PCAPng export format. The capture, logging and export
features are the open-source core.

## Where the package name shows up

- **App lists and device reports** — `com.emanuelef.remote_capture` next to the
  label "PCAPdroid".
- **Package queries** — `adb shell dumpsys package com.emanuelef.remote_capture`
  prints the installed version, the signing certificate and the install source.
- **Store listings** — the project publishes on F-Droid and on Google Play under
  this same application ID, so a package name match is not by itself proof of
  where the app came from. `dumpsys` shows the installer.

## If you did not install it

A device with a capture app on it has been used to look at network traffic.
That is normal on a developer's phone, and it is also something a repair shop,
a previous owner of a second-hand device, or an administrator of a managed
device may have installed. The app needs no root, so its presence tells you
nothing either way about whether the device is rooted — check that separately
if it matters to you.

If the phone is not yours to modify, do not uninstall apps from it on your own
initiative: on a managed device, removing the tool that produces a record can
look like tampering. Ask whoever administers it.

## How to check it on your own phone

With a USB cable and ADB, read-only:

```
adb shell pm list packages | grep remote_capture
adb shell dumpsys package com.emanuelef.remote_capture | head -40
```

No cable? The [device scan](/scan) reads the same package list over USB from
the browser and writes nothing to the phone, and [Guardian Angel](/guardian)
keeps the app list a device shares with your account — useful when you want to
notice an app appearing on a family member's phone rather than inspecting one
by hand.

## Why we run it ourselves

Our F-Droid review procedure starts a PCAPdroid capture **before** the app
under review is opened for the first time, so the connections it makes on
launch are recorded rather than missed. That is the same rule we apply to
ourselves here: a network claim is worth exactly as much as the capture
behind it, and a scan that starts after the app has already phoned home is
not evidence.

The project's [user guide](https://emanuele-f.github.io/PCAPdroid) covers
capture modes, TLS decryption and PCAP export in detail; the
[source](https://github.com/emanuele-f/PCAPdroid) is GPL-3.0-or-later.
