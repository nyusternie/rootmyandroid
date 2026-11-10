<!-- apps/rootzd/docs/relay-api-todo-2026-11-10.md -->

# HANDOFF — relay device-list endpoint (for the rootmyandroid-api team)

Date: 2026-11-10
From: daemon + web team (rootzd / apps/web)
To: rootmyandroid-api team (the `rootmyandroid-api` repo — outside this
repository, so this document is the request, not an implementation)
Status: OPEN — blocks the `/terminal` device picker (works today with
manually pasted device_ids)

## Context: what just shipped

- **rootzd v26.11.9** (CalVer, owner ruling): the relay tunnel client is
  real — Ed25519 identity + pairing + challenge + `wss` dial-out +
  first-message auth, reconnect backoff, kill-switch handling (403/4403 →
  lane parks until restart; 409 → lane parks with operator instructions).
- **E2E-encrypted client sessions** (canonical spec:
  `apps/rootzd/docs/e2e-protocol.md`): X25519 + HKDF-SHA256 +
  ChaCha20-Poly1305, transcript-bound to the device_id the client dialed.
  Implemented on BOTH ends (daemon in Rust, web in TS) with a
  cross-implementation test vector both suites assert.
- **`/terminal` page** (`apps/web/src/pages/terminal.astro`): account
  number + device_id → shell on the device. No API change was needed for
  any of this — the relay is an opaque pipe by design.

## Request (primary): device enumeration for the pairing account

There is currently **no way to list the devices paired to an account**
(verified against `rootmyandroid-api` today): `POST /v1/relay/devices`
creates/returns one device at a time and the client must already know the
device_id. The `/terminal` page therefore requires the user to paste the
64-hex device_id the daemon prints at startup — workable but hostile,
especially on mobile.

We need one of (API team's routing convention decides — both shapes are
acceptable to us):

```
GET  /v1/relay/devices?account=<account_number>
POST /v1/relay/devices/list        {"account_number": "<account_number>"}
```

Response (fields the clients will consume):

```json
{
  "devices": [
    {
      "device_id": "abc…",
      "device_name": "Pixel 5" | null,
      "paired_at": 1730000000
    }
  ]
}
```

Requirements:

1. **Scope**: devices whose `relay_devices.account_number` matches the
   caller, `revoked_at IS NULL` (a revoked device must not appear — the
   kill switch must stay invisible to the normal flow). An `include_revoked`
   flag is fine if you want the admin/debug view, not required by us.
2. **Auth**: the account number IS the credential (owner ruling
   2026-11-04 — same as relay `/connect`). No session token, no email.
3. **Rate limiting**: same `relay_attempts` machinery as the existing
   relay endpoints (a list endpoint is an enumeration oracle for
   account→device mappings without it).
4. **device_name**: the pairing request already accepts it (we currently
   send none — the daemon will start sending `getprop ro.product.model`
   once the field round-trips; today it may be null).
5. **NOT required**: `last_seen_at`/online status. That data lives in the
   relay's Durable Objects; plumbing it through is a cross-team nicety.
   The web client already discovers liveness by dialing (4404 close).

Acceptance: `/terminal` swaps the device_id text input for a picker fed by
this endpoint (account number entered → list → pick).

## Carried from the 2026-11-07 todo (still yours, still open)

`relay-api-todo-2026-11-07.md` documents, with full context: the
**revoke/kill-switch endpoint** (`DELETE /v1/relay/devices/:id` or a POST
variant — the daemon already honors `revoked_at` on every code path, the
missing piece is only the HTTP surface), plus the opportunistic
last-write-wins reaping note and the reconnect policy the daemon
implements. This doc does not supersede it.

## FYI (no action needed)

- **Broadcast semantics**: `tunnel.js` broadcasts every daemon frame to
  all attached clients and passes client frames through unattributed —
  verified 2026-11-10. The E2E protocol carries a client-chosen `sid` in
  every frame, so clients filter and the daemon demuxes. No relay or API
  change; documented here so the semantic is on the record.
- **Versioning**: rootzd now versions by date (`26.11.9`), not semver —
  the daemon reports its version inside the encrypted `session_info`
  frame, not to the API.
- **Challenge handling**: the daemon signs the raw 32 challenge bytes
  (base64url-decoded from your response) and sends a standard-base64
  signature — matches `verifyDeviceSignature`'s decoding.
