<!-- docs/HANDOFF-REPLY-2026-11-10-bootimg-library.md -->

# Bootimg library — reply from the rootmyandroid-api team (2026-11-10)

**To:** frontend/client teams
**Re:** `docs/HANDOFF-2026-11-09-api-bootimg-library.md` (pipeline workstream
requirements)

## Status: PLANNED — nothing is live yet

No bootimg endpoints exist in production today. The API surface below is
**FINAL for v1** (API-team commitment): you can scaffold UI against it now.
If any shape must change, this document gets updated and the change is
called out at the top.

## Rulings to date

1. **Gating (2026-11-09, owner):** downloads are **100% FREE**. No Nitro
   price-table change. Account bearer auth is still required on the
   download endpoint (free tier is fine — the charge is zero) because
   every download MUST be audit-logged (account number, timestamp, IP).
2. **Legal (2026-11-09, owner):** private/internal use only. Only the
   **stock `boot.img`** per build is exposed; every other staged artifact
   (patched images, Magisk APKs, TWRP, factory zips) stays internal and is
   NOT reachable through the API.
3. **Agent token (2026-11-10, owner):** the upload path authenticates with
   a **Wrangler secret named `BOOTIMG_AGENT_TOKEN`** on `rootmyandroid-api`
   (never committed to git; Wrangler secrets are write-only after setting).
   It is NOT an account token and account tokens will never work on the
   upload path.

## v1 API surface (FINAL)

### `GET /v1/bootimg/<codename>` — metadata (PUBLIC, no auth)

Per-IP rate-limited. Unknown codename → `404`.

Response `200`:

```json
{
  "ok": true,
  "codename": "redfin",
  "builds": [
    {
      "build": "UP1A.231105.001.B2",
      "sha256": "e2ce2f175d3443218c2d2a01906719931ad97ec839df8181df47ea780d96f6ea",
      "size_bytes": 100663296,
      "security_patch": "2023-11-05",
      "build_release_date": "2024-02",
      "captured_at": "2026-11-08",
      "source_url": "https://dl.google.com/dl/android/aosp/redfin-up1a.231105.001.b2-factory-4e5a2679.zip",
      "factory_zip_sha256": "4e5a26793d8400f13b72cbd17aeb284e040b3236436f0c6f3119ccc77d4495ad"
    }
  ]
}
```

(The example uses REAL staging data — verified 2026-11-10 against the
pipeline's on-disk `/Workspace/hos/bootimg-library/redfin/UP1A.231105.001.B2/source.json`.)

**Field decisions** (the pipeline's on-disk `source.json` is the source of
truth; metadata is a 1:1 projection of the fields below):

| Metadata field | On-disk field | Notes |
|---|---|---|
| `build` | directory name | NOT the fingerprint — fingerprints contain `/` and `:` and are unsafe as URL/storage keys |
| `sha256` | `boot_img_sha256` | hex, 64 chars |
| `size_bytes` | `size_bytes` | |
| `security_patch` | `security_patch` | `YYYY-MM-DD` |
| `build_release_date` | `build_release_date` | `YYYY-MM` |
| `captured_at` | `captured_date` | `YYYY-MM-DD` |
| `source_url` | `factory_zip_url` | Google-published |
| `factory_zip_sha256` | `factory_zip_sha256` | Google-published |
| — | `captured_by`, `notes`, `artifacts` | **EXCLUDED from public metadata** — internal details (the staging `notes` references internal session documents) |

**`fingerprint` caveat:** the pipeline's `source.json` records **no
`device_fingerprint` field** (verified 2026-11-10). The 11-09 requirements
doc listed fingerprints in metadata — they cannot be served from current
pipeline data. If fingerprint-based matching is needed (e.g. the v2 `/scan`
flow), the **pipeline must start recording it**; the API will add the field
to metadata at that point. Not blocking v1.

### `GET /v1/bootimg/<codename>/<build>/download` — the image bytes

- Auth: `Authorization: Bearer <account token>` — any tier, **zero charge**
  (free ruling above). `401` on missing/invalid token.
- Per-account AND per-IP rate limiting (implementation choice left to the
  API team per the ruling) — `429` with `retry_after` (same convention as
  the relay endpoints). **Handle 429 gracefully in the UI.**
- Every download is audit-logged (account, timestamp, IP).
- Unknown codename/build → `404`.
- `200`: `Content-Type: application/octet-stream`,
  `Content-Disposition: attachment; filename="boot-<codename>-<build>.img"`,
  worker-streamed from R2. (Short-TTL signed URLs were the alternative; we
  stream — one less URL to leak, and streaming keeps the audit log exact.)

### Upload path — PIPELINE ONLY (not for client apps)

Documented here only so you know it exists and why it `401`s for account
tokens. `POST /v1/bootimg/<codename>/<build>/...` with
`Authorization: Bearer <BOOTIMG_AGENT_TOKEN>`.

Transport is **two-step**, driven by a verified size constraint: the
staging `boot.img` is **100,663,296 bytes**, which exceeds the documented
Cloudflare Workers client→Worker request-body cap (~100 MB on the free
plan; this account's plan is unverified), so pushing bytes THROUGH the
Worker is not plan-safe:

1. `POST /v1/bootimg/<codename>/<build>/upload-url` → short-TTL presigned
   R2 PUT URL.
2. `PUT <upload_url>` — raw bytes, direct to R2 (Worker not in the path).
3. `POST /v1/bootimg/<codename>/<build>/finalize` with the sidecar
   `source.json` (on-disk format, verbatim) as the JSON body — the Worker
   streams the object back out of R2, **recomputes SHA-256 and rejects on
   mismatch** (requirements-doc MUST preserved; R2→Worker streaming has no
   request-size cap), and only then does the build become visible.

If the account-plan check later confirms >100 MB request bodies, a
single-step multipart variant may ship for the pipeline's convenience —
**frontend is unaffected either way** (upload is pipeline-only).

## v2 (unchanged from the requirements doc — NOT in scope yet)

- On-demand patched-image generation (server- or pipeline-side).
- Coverage stats surfaced on the site ("we have your exact boot image" in
  a `/scan` flow). The v1 metadata endpoint already carries everything this
  needs except `fingerprint` (see the caveat above).

## What we need from you (frontend/client)

- **Nothing blocking.** Scaffold against the shapes above.
- Do NOT build paywall/Nitro UI for downloads (free ruling).
- Do NOT build any upload UI (pipeline-only path).
- DO handle `429`/`retry_after` on download.

## Open items (owner/pipeline — not frontend)

1. **Operator-side storage of the agent token** — the pipeline operator's
   choice of where the value lives (suggested convention, matching
   blackhost: an env file under the operator host's credential dir).
2. **Secret provisioning** — value generation + `wrangler secret put
   BOOTIMG_AGENT_TOKEN` (API team can execute from blackhost once item 1
   is answered; the value must be archived operator-side at creation time
   because Wrangler secrets are write-only).
3. **Account-plan check** — decides single-step vs two-step upload
   transport (see above; pipeline-facing only).
