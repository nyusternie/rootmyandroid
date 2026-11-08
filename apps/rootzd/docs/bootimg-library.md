<!-- apps/rootz/docs/bootimg-library.md -->

# boot.img library (R2) — design + arrangements (2026-11-07)

Owner ask (2026-11-07): store KNOWN `boot.img` files in our own library
(Cloudflare R2) instead of depending on ad-hoc re-downloads.

## Why

Every portal root flow needs the device's STOCK `boot.img` for two things:

1. Magisk input — `boot_patch.sh` patches the stock image.
2. Rollback — `fastboot flash boot <stock>` un-bricks a bad flash.

A library entry turns "find the right factory image" from a per-user
research task into a lookup keyed by (device codename, build id).

## Layout (bucket name TBD by API team)

    /objects/{codename}/{build_id}/boot.img
    /objects/{codename}/{build_id}/boot.img.sha256
    /objects/{codename}/{build_id}/source.json
    /catalog/{codename}.json

`source.json`: `{ factory_zip_url, factory_zip_sha256 (Google-published),
boot_img_sha256, size_bytes, security_patch, captured_date, captured_by,
notes }`.

## Trust model

- Checksums chain to GOOGLE-PUBLISHED values only (the factory-images
  page). Third-party mirrors are never a checksum source.
- First entry (capture pending 2026-11-07): `redfin` / `UP1A.231105.001.B2`
  (Pixel 5, active slot `_b` observed). URL + hash to be supplied from
  Google's factory-images page (page is JS-rendered; curl fetches the
  shell only — owner supplies the row's Link URL + SHA-256).

## LEGAL — RESOLVED 2026-11-08 (Google license, verified on the page)

Google's factory-images page states verbatim: "These files are for use only
on your personal Nexus or Pixel devices and may not be disassembled,
decompiled, reverse engineered, modified or redistributed by you …".

Consequences:

- REDISTRIBUTION IS PROHIBITED — the bucket is PRIVATE, internal-use only
  (rollback/checksum servicing of OUR devices). NEVER serve objects to end
  users.
- The portal LINKS Google's official downloads; our library never
  substitutes for them in any user-facing flow.
- Checksums + source.json remain the primary value (trust anchor); the
  boot.img bytes are a private operational convenience.

## Work items

- API team: create the bucket (name TBD), private, lifecycle = keep;
  expose an internal read endpoint (admin); decide portal-facing access
  after the legal ruling.
- Daemon/portal team: capture script (download factory zip → verify
  Google-published SHA-256 → extract `boot.img` → hash it → write
  `source.json` → upload object + checksum + update catalog).
