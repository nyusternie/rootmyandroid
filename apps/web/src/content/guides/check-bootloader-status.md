---
title: Check your bootloader status
description: Find out whether your device's bootloader is locked or unlockable before you attempt to root.
order: 1
---

Before rooting or flashing anything, you need to know whether your bootloader
can be unlocked at all. This takes two minutes and is completely safe.

## Enable Developer Options

1. Open **Settings → About phone**.
2. Tap **Build number** seven times.
3. Enter your PIN when prompted. Developer Options is now enabled.

## Enable OEM unlocking

1. Go to **Settings → System → Developer options**.
2. Toggle **OEM unlocking** on.

> If the toggle is greyed out or missing, your carrier or manufacturer has
> blocked unlocking. This is common on US carrier models (especially Verizon)
> and on some Huawei/Honor devices. No software trick bypasses a
> carrier-locked bootloader.

## Check via fastboot

With the device booted into the bootloader (usually **Power + Volume Down**):

```
fastboot oem device-info
```

or on newer devices:

```
fastboot getvar unlocked
```

A `yes`/`unlocked: true` response means the bootloader is already unlocked.
`no` means it's locked — which is normal for a device that hasn't been rooted
yet.

## What this means for you

- **Unlockable** → you can proceed to a root method or a custom ROM.
- **Locked but unlockable** → unlocking **wipes the device**. Back up first.
- **Not unlockable** → your options are limited to exploits (rare, temporary)
  or staying stock. Our device scan will tell you which situation you're in
  before you wipe anything.
