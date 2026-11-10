<!-- apps/rootzd/docs/relay-api-reply-2026-11-09.md -->

# Relay/API — reply from the rootmyandroid-api team (2026-11-09)

Answers to `apps/rootzd/docs/relay-api-todo-2026-11-07.md` (§1 kill switch,
§4 confirmations) and `apps/rootzd/docs/relay-api-todo-2026-11-10.md`
(device list). Both requested endpoints are SHIPPED.

**Status: LIVE.** Merged to master via PR #6 (`0f3e978`) and deployed to
production — CI run 42746975441 (tests + deploy, all green), merge at
2026-11-10T03:04:10Z UTC. Both endpoints verified responding at
`https://api.rootmyandroid.com/v1/relay/devices/list` and
`.../v1/relay/devices/{id}` (DELETE). Tests at merge time: relay suite
34/34, full API suite 199/199. Branch commits: `96bd18f` list, `4b78961`
revoke, `a22f119` comment rename (Rooted -> Rootz, aligning with the
product rename ruling and this handoff's own title).

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

**RULED 2026-11-09 — un-revoke: option (c), PERMANENT BY DESIGN.** A revoked
key returns `403 device_revoked` forever; `revoked_at` is never cleared.
Rationale (matches PKI practice — RFC 5280 key-compromise revocation is
one-way): the kill switch exists for lost/stolen devices, and a key that
left the owner's control cannot be proven uncompromised on return —
un-revoking would silently re-arm an attacker who copied the key while the
device was gone. **Recovery path, daemon-team action required:** on
`device_revoked` the daemon generates a FRESH keypair and re-pairs as a new
identity (zero API work; whether the daemon supports fresh-keypair
generation today is UNVERIFIED — flagged to the daemon team).

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

- **Halo metering: NO ACTION** (11-07 §3, owner ruling 2026-11-04) —
  restated as still in force.

## 6. Observability — SHIPPED 2026-11-09 (11-07 §2)

Relay telemetry now lands in the first-party analytics D1
(`rootmyandroid-analytics` — the same database the Admin Center reads),
from BOTH workers, both write paths fire-and-forget and never throwing
(the `recordEvent` precedent: analytics must never break the tunnel/money
path). No device ids or account numbers are ever written — aggregate
metrics only, matching the database's privacy posture.

**From rootmyandroid-api** (events table, `source = 'server'`, no visitor
hash — daemon IPs are machine clients, webhook parity):

- `relay_pair_failed` — `detail` = error code: `invalid_account_number` |
  `account_not_found` | `invalid_device_pubkey` | `device_already_paired` |
  `device_revoked`. (Unparseable bodies return `invalid_json` before any
  attribution context exists and are deliberately not instrumented.)
- `relay_rate_limited` — `detail` = the scope that tripped: `pair_ip` |
  `pair_account` | `challenge_device` | `challenge_account` | `list_ip` |
  `list_account` | `revoke_ip` | `revoke_account`.

**From rootmyandroid-relay** (DeviceTunnel Durable Object):

- New `relay_tunnels` table — ONE row per authenticated daemon session:
  `opened_ts` / `closed_ts` (unix seconds, NULL while open), `close_code`
  (1000 normal, 4000 superseded, 4403 revoked, 4429 rate-limited, ...),
  and opaque payload volume per direction (`bytes_from_daemon`,
  `bytes_to_daemon`, `frames_from_daemon`, `frames_to_daemon`). Counters
  accrue in DO memory (free) and flush ONCE at close.
- `relay_superseded` event — emitted exactly once when a fresh daemon
  connection supersedes the old one (close 4000). Counting flap frequency
  is the 11-07 §2 use case.

**Ready-made dashboard queries** (D1 SQL):

```sql
-- devices online now (gauge approximation — see caveats)
SELECT COUNT(*) AS online FROM relay_tunnels WHERE closed_ts IS NULL;
-- tunnel uptime, last 24 h (seconds)
SELECT SUM(closed_ts - opened_ts) AS uptime_s FROM relay_tunnels
 WHERE opened_ts > unixepoch() - 86400 AND closed_ts IS NOT NULL;
-- bytes + frames relayed, last 24 h
SELECT SUM(bytes_from_daemon + bytes_to_daemon) AS bytes,
       SUM(frames_from_daemon + frames_to_daemon) AS frames
  FROM relay_tunnels WHERE opened_ts > unixepoch() - 86400;
-- abuse signal, last 24 h (pairing failures, rate-limit hits, supersedes)
SELECT name, detail, COUNT(*) AS n FROM events
 WHERE ts > unixepoch() - 86400
   AND name IN ('relay_pair_failed', 'relay_rate_limited', 'relay_superseded')
 GROUP BY name, detail;
```

**Caveats (documented in code, restated here):**

- workerd does not fire a DO's `webSocketClose` for SERVER-initiated
  `ws.close()` (verified empirically against workerd 1.20250906.0), so
  DO-initiated closes (supersede 4000, rate-cap 4429, oversize 4409, error
  1011) flush at their close CALL SITES; peer closes flush in
  `webSocketClose`. The flush SQL is idempotent (`WHERE closed_ts IS NULL`)
  so double-path coverage is free.
- A DO eviction with no close event leaves a stale open row and loses that
  session's counters: the online gauge and volume sums are approximations,
  not billing-grade. Good enough for 11-07 §2's purposes.
- The analytics schema is additive-only for the Admin Center: its
  `src/lib/analytics.js` carries NO DDL copy (verified 2026-11-09) and
  queries by table/column name, so `relay_tunnels` needed no admin-repo
  change. The api repo's overbroad "KEEP THE SCHEMA IN SYNC" comment was
  corrected to state this rule.

**Deployment status:** the API half ships with the api worker (CI deploy on
merge, PR #10 — tests 201/201). The relay half is committed to
`rootmyandroid-relay` main (`6054062`, tests 27/27) but needs
`npm run deploy` from a wrangler-authenticated shell — no Cloudflare
credential exists in the commit environment, and the relay repo has no CI.
No migration is needed: the api worker self-ensures `relay_tunnels` at
runtime on its next analytics write. Until the relay deploy happens, only
the API-side events flow.
