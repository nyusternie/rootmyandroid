---
name: Rootz
summary: The package name of Rootz — the relay daemon that lets a browser terminal reach a phone over wireless ADB.
developer: Root My Android
category: UtilitiesApplication
official: https://rootmyandroid.com/rootz
source: https://rootmyandroid.com/downloads
license: MIT
system: false
related:
  - href: /terminal
    label: Open the web terminal
  - href: /rootz
    label: What Rootz is
  - href: /rootzd
    label: rootzd — the root-tier daemon
checked: 26 Nov 2026
---

`com.rootmyandroid.rootz` is the application ID of **Rootz**, our relay daemon
for phones that are not rooted. It holds a tunnel to our relay and lets a shell
session from a browser reach the phone over wireless ADB, as the `shell` user.

## What the app does

- **Pairs once** — the phone is bound to an account number and a device key; the
  pairing is what the relay checks on every dial-out.
- **Keeps a tunnel** — a foreground service with an ongoing notification, so the
  phone stays reachable after a reboot and with the app closed.
- **Runs shell lines** — each line a client sends is executed through the phone's
  own wireless-ADB connection, as uid 2000. Commands pass a guard before they
  run; gated ones are refused.
- **Has no command surface of its own** — there is nothing to type in the app.
  Sessions live in the [web terminal](/terminal) or another client.

The app has no launcher icon by design: it is a daemon, and it is opened from
its notification. Rooted devices use [rootzd](/rootzd) instead, which runs the
same protocol in the root tier.

## Where the package name shows up

- App lists and device reports, next to the label "Rootz".
- `adb shell dumpsys package com.rootmyandroid.rootz` prints version, signature
  and install source.
- The relay notification: an ongoing entry titled "Rootz Relay" while the tunnel
  is up.

## How to check it on your own phone

```
adb shell pm list packages | grep rootz
adb shell dumpsys package com.rootmyandroid.rootz | head -40
```

The browser-based [device scan](/scan) reads the same information without
installing anything, and [Rootz](/rootz) explains the pairing steps end to end.
