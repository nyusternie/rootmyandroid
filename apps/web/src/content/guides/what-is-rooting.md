---
title: What rooting actually does (and doesn't)
description: Root access explained plainly — what you gain, what you risk, and what has changed in modern Android.
order: 2
---

Rooting gives you **superuser (uid 0) access** on your own device — the
equivalent of Administrator on Windows or `sudo` on Linux. Android runs on the
Linux kernel; rooting just removes the restriction that keeps you out of the
deepest level of your own hardware.

## What you gain

- **Full backups** of apps and their data (not the partial cloud kind).
- **Remove bloatware** properly, not just "disable" it.
- **System-wide ad/tracker blocking** at the hosts-file level.
- **Custom ROMs** like LineageOS or GrapheneOS — newer Android on phones the
  manufacturer abandoned, or a de-Googled system entirely.
- **Firewall and permission control** far beyond stock settings.

## What you risk

- **Warranty**: unlocking the bootloader may void it, depending on
  manufacturer and jurisdiction.
- **Wiped data**: unlocking the bootloader factory-resets the device.
- **App compatibility**: banking and payment apps check for root via
  Play Integrity. Most can be worked around, but it's an ongoing cat-and-mouse
  game.
- **Bricks**: flashing the wrong image for your exact model/firmware can
  soft-brick the phone. This is why device-matched instructions matter.

## What changed in modern Android

Old one-click root exploits are dead — and that's a good thing, because they
were security holes. The modern, legitimate path is:

1. Unlock the bootloader (manufacturer-supported on Pixels, OnePlus, and
   many Xiaomis).
2. Patch the boot image with **Magisk**.
3. Flash the patched image via fastboot.

No exploits, no sketchy APKs. The hard part is that steps 2–3 differ by
device, firmware version, and even region — which is exactly what our device
scan figures out for you.

## Next step

[Check your bootloader status](/guides/check-bootloader-status) — it takes two
minutes and decides everything that comes after.
