# HANDOFF — Private boot.img library in R2 (API team)

- **Date:** 2026-11-09
- **From:** agent session (rootz/rootzd/redfin workstream)
- **To:** `rootmyandroid-api` team (Cloudflare Worker + R2)
- **Status:** APPROVED by owner 2026-11-09 ("complete ASAP, but one thing at a
  time") — build may start once the two OWNER DECISIONS below are ruled.

## Why this exists

Patch-boot-image + fastboot flash is now THE root method (Magisk's own
install docs; proven end-to-end on our redfin rig — session log RS-27..31).
That makes **stock boot images the product's core artifact**: every guided
root flow begins by fetching the exact image matching the device's build
fingerprint, verifying its SHA-256, and patching it. Today those images are
fetched from Google's factory zips per-run (slow, JS-gated pages, mirror
workarounds — hurdles H-05..H-08 in the device-unlock skill). A private,
verified, worker-mediated library turns every future root run into a lookup.

This is also where the "recovery-era value" moved: with TWRP dropped from
the roadmap (owner ruling 2026-11-09), the boot-image library is the
artifact repository customers actually touch.

## Hard constraints (do not relax)

1. **Google factory-image licenses forbid redistribution.** The library is
   PRIVATE: objects sit in a non-public R2 bucket and every byte is served
   through the Worker per authenticated, audit-logged request. NEVER make
   the bucket public, NEVER publish a browsable index, NEVER hot-link.
2. **Verified bytes only.** An image enters the library ONLY with a
   provenance record (`source.json`) and a SHA-256 that the upload path
   re-verifies. Trust no unverified bytes (skill hurdle H-07 resolution).
3. Binaries never enter the git repos (metadata + docs only).

## Already-established local pattern (mirror this layout)

The device-unlock pipeline already stages images on the operator's machine:

```
/Workspace/hos/bootimg-library/<codename>/<BUILD>/boot.img
/Workspace/hos/bootimg-library/<codename>/<BUILD>/source.json
```

R2 object keys SHOULD mirror this: `<codename>/<build-fingerprint>/boot.img`
and `<codename>/<build-fingerprint>/source.json`. Keying by full build
fingerprint (not just build number) avoids collisions across regions/carriers.

## v1 deliverables (API team)

1. **R2 bucket** (name TBD by API team, e.g. `rma-bootimg`), public access
   disabled.
2. **Endpoints** (contract proposals — API team owns final shape):
   - `GET /v1/bootimg/<codename>/<build>` → JSON metadata:
     `{exists, sha256, size, provenance:{source_url, captured_at, captured_by}}`.
     Auth: account bearer token (any tier).
   - `GET /v1/bootimg/<codename>/<build>/download` → the image bytes
     (Worker-streamed from R2, or a short-TTL signed URL — API team's call).
     EVERY download MUST be audit-logged (account number, timestamp, IP).
   - `POST /v1/bootimg/<codename>/<build>` → upload path for the
     device-unlock pipeline (agent-operated). Body: multipart or raw bytes +
     sidecar `source.json`. Server MUST recompute SHA-256 and reject on
     mismatch with the sidecar. Auth: dedicated agent token, NOT an account
     token (see OWNER DECISIONS).
3. **Provenance schema** (`source.json`):
   ```json
   {
     "source_url": "https://dl.google.com/dl/android/aosp/redfin-rd1a.201105.003.a1-factory-XXXX.zip",
     "sha256": "<hex>",
     "captured_at": "<ISO-8601>",
     "captured_by": "device-unlock-pipeline | manual | <agent-id>",
     "device_fingerprint": "google/redfin/redfin:11/...",
     "notes": "free text"
   }
   ```

## v2 (flagged, NOT in scope yet)

- On-demand patched-image generation (Magisk patch server-side or
  pipeline-side, per request) and per-user patched-image storage.
- Coverage stats surfaced on the site ("we have your exact boot image"
  during a /scan flow — free-tier value display).

## OWNER DECISIONS

1. **Gating: RULED 2026-11-09 — downloads are 100% FREE** (supersedes the
   earlier Nitro-billed recommendation). Metadata and download both free;
   NO Nitro price-table change needed. Because downloads are free,
   per-account RATE LIMITING is strongly advised (implementation choice
   left to the API team) on top of the mandatory audit logging.
2. **Agent token (still needed):** how is the upload-path token
   issued/stored (Wrangler secret? 1Password entry? separate from all
   customer tokens).

## Related, previously handed off (unchanged)

- The **rootzd relay contract** (daemon outbound dial-out, mTLS/Noise,
  pairing-bound device key, kill switch) was handed off earlier and is
  unchanged. See the daemon's `apps/rootzd/src/main.rs` header +
  `ROOTZD_RELAY` TODO block for the current stub state.

## References

- `AGENTS.md` (rules 2, 3, 3a; Nitro economy)
- `.agents/skills/device-unlock/SKILL.md` (Phase C acquisition flow,
  hurdles H-05..H-08, library/provenance rules)
- `apps/rootzd/docs/redfin-unlock-session.md` (the proof-of-concept root
  run, RS-01..RS-45)
- `HANDOFF.md` §13 addendum 2 (2026-11-09 rulings)
