<!-- apps/rootzd/docs/relay-api-reply-2026-11-09.md -->

# Relay/API — reply from the rootmyandroid-api team (2026-11-09)

Answers to `apps/rootzd/docs/relay-api-todo-2026-11-07.md` (§1 kill switch,
§4 confirmations) and `apps/rootzd/docs/relay-api-todo-2026-11-10.md`
(device list). Both requested endpoints are SHIPPED.

**Status caveat:** the code is committed on the API repo branch
`feat/relay-pairing-challenge` (commits `96bd18f` list, `4b78961` revoke) —
NOT yet merged to main or deployed to `api.rootmyandroid.com`. Tests: relay
suite 34/34, full API suite 199/199.

## 1. SHIPPED — POST /v1/relay/devices/list (11-10 requirement 1)

Open questions in the 11-10 doc, resolved:

- **Shape: POST + JSON body** (not GET + query). The account number is the
  ONLY secret on this endpoint, and the house rule is that it never travels
  in URLs/logs (same convention as `/v1/backups/list`).
- **Field name: `created_at`** — an ISO-8601 string
  (`2026-11-09T21:34:56.789Z`), matching the pair response shape. The
  proposed `paired_at` unix int was not adopted.
- **Revoked devices: always invisible.** No `include_revoked` flag exists;
  the kill switch must not surface in the normal flow (as the doc required).

Request:

```json
POST /v1/relay/devices/list
{ "account_number": "1234 5678 9012 3456" }
```

Response `200` (newest first; `device_name` is null when the daemon never
sent one; `device_pubkey` is deliberately NOT in the response — clients
have no use for it and omitting it keeps the response a smaller oracle):

```json
{
  "ok": true,
  "account_number": "1234 5678 9012 3456",
  "devices": [
    {
      "device_id": "ab12…64hex",
      "device_name": "Pixel 5",
      "created_at": "2026-11-09T21:34:56.789Z"
    }
  ]
}
```

Errors: `400 invalid_json` · `400 invalid_account_number` ·
`404 account_not_found` (unknown account) · `429 rate_limited` (+
`retry_after` seconds).

Rate caps: **20/h per IP, 30/h per account.** The per-IP cap is checked
BEFORE account validation (pair parity), so existence-oracle probing burns
budget up front — after 20 hits from one IP, even an invalid account number
gets a 429, not a 400.

## 2. SHIPPED — DELETE /v1/relay/devices/{device_id} (11-07 §1 BLOCKER)

The production-pairing blocker is resolved. Exactly per the spec:

- Auth: raw account number bound to the device, in the JSON body
  (`{ "account_number": "…" }`). The `device_id` in the path is a public
  key hash, not a secret, so the path is fine.
- Rate-limited like pairing: **20/h per IP, 10/h per account** (per-IP
  checked first).
- `204` No Content on success (no body). `404 device_not_found` for unknown
  AND cross-account devices — byte-identical bodies, no existence leak.
  `429 rate_limited` (+ `retry_after`). Also `400 invalid_json` /
  `400 invalid_account_number` / `404 account_not_found` (unknown account).
- **Idempotent:** re-revoking an already-revoked device returns 204 again
  and preserves the ORIGINAL `revoked_at` (the first revocation is the
  audit fact).

Effect is immediate and already honored everywhere: new challenges →
`403 device_revoked`; tunnel connect → close `4403`; the device vanishes
from the list endpoint.

**OPEN sub-item — the un-revoke (re-pair) flow needs a ruling.** Revocation
is PERMANENT today: re-pairing a revoked key keeps returning
`403 device_revoked` (this was the pre-existing behavior and the 11-07 doc
did not pin the semantics down). Options: (a) re-pair by the owning account
clears `revoked_at`; (b) a dedicated un-revoke endpoint; (c) permanent by
design — a revoked key can never be re-used, a lost/replaced device
generates a fresh keypair. The daemon + web teams and the owner pick; the
API implements.

## 3. Confirmations requested in 11-07 §4

Verified against the `rootmyandroid-relay` worker and the API repo:

- **Supersede-on-reconnect closes the OLD session with 4000** (reason
  `superseded`), not 4401 — `src/tunnel.js:162`. CONFIRMED.
- **Frame caps: 64 KiB + 100 frames/second/socket** —
  `MAX_FRAME_BYTES = 64 * 1024` (`src/tunnel.js:17`),
  `MAX_FRAMES_PER_SECOND = 100` (`src/tunnel.js:18`); a socket exceeding the
  rate cap is closed `4429 rate_limited` (`src/tunnel.js:90`). CONFIRMED.
- **Reconnect backoff:** the relay enforces no minimum reconnect interval,
  so the daemon's 1 s → 60 s + jitter plan is compatible with the tunnel
  itself. ONE COLLISION TO NOTE, verified by the numbers: every reconnect
  needs a fresh challenge, and challenges are capped at **12/h per device**
  (`CHALLENGE_MAX_PER_DEVICE_PER_HOUR`). A daemon flapping at the 60 s
  backoff ceiling would attempt ~60 challenges/hour and get 429s. The
  daemon MUST honor `retry_after` in the challenge 429 body (treat it as
  its backoff floor, not as a fatal error).
- **Challenge TTL 300 s:** `CHALLENGE_TTL_SECONDS = 300`
  (`src/lib/relay.js`). CONFIRMED as implemented; the "flag if slow flash
  proves tight" watch item stands — metrics will show.

## 4. Other findings

- **`device_name` already round-trips server-side.** Pair stores and
  returns it; list returns it. The daemon just doesn't send it yet — a
  daemon-side change only, no API work needed. (11-10 doc's read that it
  "doesn't round-trip today" is stale.)
- **Phantom cross-reference in the 11-10 doc:** it cites a "last-write-wins
  reaping note" in the 11-07 doc — no such note exists there. The actual
  mechanism is challenge SUPERSESSION: issuing a new challenge deletes any
  still-unconsumed predecessors for that device (`issueChallenge`,
  `src/lib/relay.js`), so reconnects always get a fresh nonce and old ones
  die immediately. Worth fixing the 11-10 doc's reference.
- **Stale refs fixed on our side:** 4 comments in the API repo pointed at
  the old `apps/rooted/` path (pre-rename); they now point at
  `apps/rootzd/` (commit `4b78961`).

## 5. Remaining open items

- **Un-revoke flow ruling** (§2 above) — the only thing blocking full
  kill-switch closure.
- **Observability** (11-07 §2): metrics not yet emitted on either side.
- **Merge + deploy** of `feat/relay-pairing-challenge` — the endpoints
  above are dark until then.
- **Halo metering: NO ACTION** (11-07 §3, owner ruling 2026-11-04) —
  restated as still in force.
