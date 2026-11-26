<!-- docs/HANDOFF-ACK-2026-11-26-harness-api.md -->

# ACK / REVIEW — Harness API (Option B) reply

**To:** API team (`rootmyandroid-api`)
**From:** web + Android workstream (`rootmyandroid`)
**Date:** 2026-11-26
**Re:** `rootmyandroid-api/docs/HANDOFF-REPLY-2026-11-26-harness-api.md`
**Status:** reviewed. Routes live. Two corrections accepted. One rate-limit
finding for the API team; the web/tool follow-ups are shipped.

Per `AGENTS.md` rule 9 this repo did not edit `rootmyandroid-api`.

---

## 1. What we verified from this side (read-only)

- `GET https://rootmyandroid.com/v1/` lists
  `/v1/harness/heartbeat (POST) — Rootz harness snapshot ingest (free)` and
  `/v1/harness/agents/list (POST) — latest harness snapshot (free)`.
- `POST /v1/harness/agents/list` with a nonexistent 16-digit account:
  `404 { "ok": false, "error": "account_not_found" }`.
- `POST /v1/harness/agents/list` with `device_id: "nope"`:
  `400 { "ok": false, "error": "invalid_device_id" }`.
- `POST /v1/harness/heartbeat` with a nonexistent account:
  `404 { "ok": false, "error": "account_not_found" }` (no row created).
- `POST /v1/harness/heartbeat` with `device_id: "nope"`:
  `400 { "ok": false, "error": "invalid_device_id" }`.
- Code read: `src/lib/harness.js` has no `chargeService` call; the handler
  returns `free: true`; `src/schema.js` carries the composite PK + FK;
  `validateHarnessSnapshot` uses `TextEncoder` for the 16 KiB cap;
  `device_id` is lowercased before validation.

The API team's own production recipe (§7 of the reply) covers the successful
heartbeat, `guru_balance` staying `0`, the 413, and the upsert; we did not
repeat the write checks without an account.

---

## 2. Corrections accepted

### 2.1 The audit route has no rate limiting

Correct. `handleAuditSave` / `handleAuditList` contain no `hitRateLimit` call.
Our handoff's “mirror the audit route's limits” line was wrong. The shipped
constants in `src/lib/harness.js` are now the record:

| scope | shipped limit |
| --- | --- |
| `harness_list_ip` | 20/h/IP |
| `harness_list_account` | 30/h/account |
| `harness_heartbeat_ip` | 60/h/IP |
| `harness_heartbeat_account` | 240/h/account |

### 2.2 The page fell back on `account_not_found`

Correct. The old branch was `harness.status === 404` for every 404. The page
now uses `isAccountNotFound` (`apps/web/src/lib/harness.ts`) and returns the
account error without an audit request; `harness_snapshot_not_found` and a
route-level 404 still fall back. Pinned by `harness.test.ts`.

---

## 3. Deviations accepted

All ten deviations in the reply are acceptable:

- `ok: false` on every error body (uniform with the worker).
- 16 KiB measured with `TextEncoder` (the handoff says KiB, not UTF-16 units).
- `device.id` mismatch → `invalid_device_id` (id fault, not shape fault).
- `device_name` COALESCE-preserved; payload/`collected_at` replaced.
- `received_at` = latest receipt (the page shows it; first-receipt semantics
  are not needed).
- Composite PK + FK; no concurrent-insert race path.
- `recordEvent` on every 429 with the scope as detail.
- `ensureSchemaOnce` at handler start.
- `test/setup.js` drops `harness_snapshots` before `accounts`.
- Uppercase hex accepted and stored lowercase; the page already lowercases.

---

## 4. Finding — the heartbeat IP limit does not fit the tool's floor

The reply's §0 says: *“Heartbeats are sized so `--watch` at its documented
floor still fits.”* That is true for the account limit, not for the IP limit:

| cadence | writes/h | against `harness_heartbeat_ip` 60/h | against `harness_heartbeat_account` 240/h |
| --- | --- | --- | --- |
| one device, 60 s (tool default) | 60 | exactly at the limit | fits |
| one device, 15 s (tool floor) | 240 | **4× over** | exactly at the limit |
| two devices, 60 s, one IP | 120 | **2× over** | fits |
| five devices, 60 s, one IP/account | 300 | **5× over** (one IP) | **over by 60/h** |

The tool now prints a startup warning when `--interval` is below 60 s, and its
default 60 s fits the current IP limit for one device. The account's
five-device ceiling and the 15 s floor do not.

**Target deployment:** up to five Rootz harness devices per account, each at
the tool's 60 s default; one device at the 15 s floor also fits. The
one-harness-per-IP profile is not the target.

**Requested change:** raise **both** heartbeat limits to 300/h:

```js
HARNESS_HEARTBEAT_MAX_PER_IP_PER_HOUR = 300
HARNESS_HEARTBEAT_MAX_PER_ACCOUNT_PER_HOUR = 300
```

The 240/240 option is withdrawn. The standalone request is
`docs/HANDOFF-2026-11-26-harness-rate-limits.md`; the API team owns only the
two constants. The tool's warning string lives in this repo and is being
made limit-agnostic.

---

## 5. Follow-ups shipped on the web/tool side

- Page 404 distinction: `isAccountNotFound` + test.
- Page copy: the dedicated route is live; the audit snapshot is the fallback.
- Page + tool: 429 `retry_after` surfaced; the tool also has the 16 KiB size
  warning, B `413` → audit fallback when `--audit-fallback`, and the
  `--interval < 60` warning.
- Docs: the API handoff now points at the reply, carries the shipped rate
  limits, and its heartbeat example includes `device.id` (the reply's §8
  caught the invalid `"device": {}` example).
- Dev mock: `apps/web/tools/mock-harness-api.mjs` still exercises the B path
  without the Worker; the Worker route is now the production path.

---

## 6. Remaining open items

- Rate-limit numbers above (API team decision).
- Staleness/TTL threshold (owner has not ruled a value; the page shows
  `received_at` without a stale badge).
- Model hashes/license (not in the contract; unknown fields round-trip).
- `harness_snapshots` table name (shipped as proposed; a rename costs a
  migration).
- A stays indefinitely (the API team kept the audit route unchanged).
