<!-- docs/HANDOFF-2026-11-26-harness-api.md -->

# HANDOFF — Harness API (Option B): heartbeat + agents list

**To:** API team (`rootmyandroid-api`)
**From:** web + Android workstream (`rootmyandroid`)
**Date:** 2026-11-26
**Status:** SHIPPED by the API team — see
`rootmyandroid-api/docs/HANDOFF-REPLY-2026-11-26-harness-api.md` (commits
`f209b18` + `776a1f5`, CI `45889707477`, deployed and verified live). Owner
rulings: **the heartbeat is FREE**, device-local endpoints are shown, and the
scope is the **Rootz harness only** for now.

Per `AGENTS.md` rule 9 this document is the write channel into
`rootmyandroid-api`; the API team applied it in its own repo. Review:
`docs/HANDOFF-ACK-2026-11-26-harness-api.md`.

---

## 0. Why this route exists

The web page `https://rootmyandroid.com/harness` is live. It reads the Rootz
harness registry through two paths:

1. **Option B (primary, this request):** `POST /v1/harness/agents/list`.
2. **Option A (fallback):** `POST /v1/device/audit/list` with
   `audit_type: "harness-agents"`.

The page calls B first and falls back to A when B has no row or is
unavailable. The Rootz heartbeat tool
(`apps/rootzd/tools/harness-heartbeat.mjs`) posts B first and falls back to A
only with `--audit-fallback`. **The Worker route is live.**

The page and the tool were already wired; the API team shipped the route.
The audit fallback remains for older devices and for explicit tool use.

---

## 1. Owner rulings (2026-11-26)

- **The harness heartbeat is FREE.** No GURU charge, no `audit_report` gate,
  no first-slot charge. The audit fallback keeps its existing first-slot
  charge; B does not.
- **Device-local endpoints are shown** on `/harness` (`127.0.0.1:8399`-style).
  The page displays them for the operator; they are not exposed off-device.
- **Scope is the Rootz harness only.** Third-party agent discovery is a later
  integration; do not build a general app scanner here.

---

## 2. Routes

### 2.1 `POST /v1/harness/heartbeat` — device writes

Request:

```json
{
  "account_number": "1234567890123456",
  "device_id": "64-hex relay device id",
  "device_name": "Pixel 5",
  "snapshot": {
    "schema": 1,
    "collected_at": "2026-11-26T19:00:00Z",
    "device": { "id": "64-hex relay device id" },
    "runtime": {},
    "agents": []
  }
}
```

Response `200`:

```json
{
  "ok": true,
  "device_id": "64-hex relay device id",
  "received_at": "2026-11-26T19:00:01Z",
  "free": true
}
```

Rules:

- Normalize the account number exactly like the account/audit routes; reject
  an invalid 16-digit number with `400 { "error": "invalid_account_number" }`.
- `device_id` MUST be the 64-hex relay device id. Reject anything else with
  `400 { "error": "invalid_device_id" }`. The page joins the picker and the
  snapshot on this value.
- `snapshot` MUST be an object with `schema: 1`, `device`, `runtime`, and an
  `agents` array. Reject the core shape with
  `400 { "error": "invalid_snapshot" }`.
- Upsert one row per `(account_number, device_id)`; `received_at` is the
  server timestamp. A repeat heartbeat replaces the previous payload.
- **No charge.** Do not call `chargeService`, do not touch the `audit_report`
  gate, and do not require a GURU balance. The response's `free: true` is
  informational.
- Size cap: 16 KiB serialized `snapshot`. Reject with
  `413 { "error": "snapshot_too_large" }`.
- No prompts, completions, chat history, model weights, files, shell output,
  or user identifiers.
- Rate-limited through the existing helper. Shipped constants
  (`rootmyandroid-api/src/lib/harness.js`): `harness_heartbeat_ip` 60/h/IP,
  `harness_heartbeat_account` 240/h/account.
- Return `404 { "error": "account_not_found" }` when the account is unknown.

### 2.2 `POST /v1/harness/agents/list` — page reads

Request:

```json
{
  "account_number": "1234567890123456",
  "device_id": "64-hex relay device id"
}
```

Response `200`:

```json
{
  "ok": true,
  "snapshot": { "schema": 1, "device": {}, "runtime": {}, "agents": [] },
  "received_at": "2026-11-26T19:00:01Z"
}
```

Rules:

- Same account/device validation as the heartbeat route.
- Read-only; no charge.
- No row for `(account_number, device_id)`:
  `404 { "ok": false, "error": "harness_snapshot_not_found" }`. The page falls
  back to the audit snapshot.
- Unknown account: `404 { "ok": false, "error": "account_not_found" }`. The
  page shows the account error and does not fall back (`isAccountNotFound`
  in `apps/web/src/lib/harness.ts`).
- Rate-limited through the existing helper. Shipped constants:
  `harness_list_ip` 20/h/IP, `harness_list_account` 30/h/account.
- `429` is surfaced by the page as a rate-limit message.

---

## 3. D1 shape (proposal)

Table `harness_snapshots`:

| column | type | note |
| --- | --- | --- |
| `account_number` | TEXT | normalized account number |
| `device_id` | TEXT | 64-hex relay device id |
| `device_name` | TEXT | display label |
| `payload` | TEXT | serialized snapshot |
| `collected_at` | TEXT | device timestamp |
| `received_at` | TEXT | server timestamp |
| `updated_at` | TEXT | server timestamp |

SQL sketch (not executed here):

```sql
CREATE TABLE IF NOT EXISTS harness_snapshots (
  account_number TEXT NOT NULL,
  device_id      TEXT NOT NULL,
  device_name    TEXT,
  payload        TEXT NOT NULL,
  collected_at   TEXT,
  received_at    TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (account_number, device_id)
);
CREATE INDEX IF NOT EXISTS idx_harness_snapshots_account
  ON harness_snapshots (account_number);
```

D1 access stays with the API team. This repo's Cloudflare credentials are for
this project's Pages deploy, not the API's D1 (`AGENTS.md` rule 11).

---

## 4. Snapshot validation

The page's validator is `apps/web/src/lib/harness.ts` (`parseHarnessSnapshot`).
The API does not need to duplicate every field check, but it must reject the
core shape and the size cap before storing.

- `schema === 1`.
- `device` is an object; `runtime` is an object; `agents` is an array.
- `device.id` is present and equals the request's `device_id`.
- `agents` is capped at 24 rows for the page; the API can store the array as
  sent under the 16 KiB cap.
- Numeric fields are finite numbers; strings are bounded.
- Unknown fields are stored as-is; the page ignores them.
- The full field contract is in
  `docs/HANDOFF-2026-11-26-harness-page.md` §4.

---

## 5. Fallback and migration

- B first; A fallback on 404.
- The page is already wired (`apps/web/src/scripts/harness.ts`).
- The Rootz heartbeat tool is already wired
  (`apps/rootzd/tools/harness-heartbeat.mjs`).
- Once B is live, A stays for older devices and for the tool's explicit
  `--audit-fallback` mode.
- One valid snapshot is enough; the page never requires both.
- **B is free. The audit fallback is not free on the first write:**
  `POST /v1/device/audit` charges the first `(device, audit_type)` slot at the
  `audit_report` price (`rootmyandroid-api/src/index.js` PRO gate;
  `src/lib/guru.js`). Refreshes are free. The tool warns before using
  `--audit-fallback`.
- **Size asymmetry:** B caps the snapshot at 16 KiB (bytes); A accepts up to
  512 KiB. The heartbeat tool warns above 16 KiB and, with
  `--audit-fallback`, retries A on a B `413`.

---

## 6. Verification recipe

Use a test account and a test device; no production credentials belong in
this document.

```bash
# 1. Heartbeat (free; replace the placeholders)
curl -sS https://rootmyandroid.com/v1/harness/heartbeat \
  -H 'content-type: application/json' \
  -d '{"account_number":"<16 digits>","device_id":"<64 hex>","device_name":"Pixel 5","snapshot":{"schema":1,"collected_at":"2026-11-26T19:00:00Z","device":{"id":"<64 hex>"},"runtime":{},"agents":[]}}'

# 2. Read it back
curl -sS https://rootmyandroid.com/v1/harness/agents/list \
  -H 'content-type: application/json' \
  -d '{"account_number":"<16 digits>","device_id":"<64 hex>"}'
```

Then:

- Open `https://rootmyandroid.com/harness/`, enter the account number, pick
  the device, press **Sync agents**. The source line reads
  `Dedicated harness route · received …` when B is live.
- Run the tool with `--dry-run` first, then without:
  `node apps/rootzd/tools/harness-heartbeat.mjs --snapshot apps/rootzd/tools/harness-snapshot.example.json --account <16 digits> --device <64 hex> --device-name "Pixel 5"`.
- For a continuous test, add `--watch --interval 60`; the tool re-reads the
  snapshot file each cycle. With `--audit-fallback`, the first audit write
  carries the audit-route charge and later refreshes are free.
- To exercise the page's B path locally without a production account, run
  the DEV-ONLY mock: `node apps/web/tools/mock-harness-api.mjs` (port 8787),
  then set `window.__RMA_API_BASE__ = 'http://127.0.0.1:8787/v1'` in the
  browser console. The mock preloads account `1234567890123456` and device
  `aaaa…`; the page's **Sync agents** reads the mock heartbeat route.

---

## 7. Implementation checklist (API team — shipped)

- [x] D1 migration for `harness_snapshots`.
- [x] `POST /v1/harness/heartbeat` handler: validation, 16 KiB cap, upsert,
      free, `received_at`; return `free: true` and never call
      `chargeService`.
- [x] `POST /v1/harness/agents/list` handler: read, 404 shapes, free.
- [x] Router entries + the route catalog (the API's `/` route list).
- [x] Rate limits through the existing helper.
- [x] Tests: 200 heartbeat, 200 list, upsert replaces, 404 no row, 404
      account, 400 invalid device/snapshot, 413 size, 429, **no GURU charge**.
- [x] Deploy and run the curl recipe above.
- [x] Reply in `rootmyandroid-api/docs/HANDOFF-REPLY-2026-11-26-harness-api.md`.

---

## 8. Open items after the reply

- **Rate-limit numbers — SHIPPED, follow-up requested:** 60/h/IP heartbeat
  does not fit the tool's 15 s floor (240/h) and does not fit two devices at
  60 s behind one IP. See the ACK for the math and
  `docs/HANDOFF-2026-11-26-harness-rate-limits.md` for the two-constant
  request.
- **Staleness/TTL** — not implemented; `received_at` is returned and the page
  shows it without a stale badge (owner has not ruled a threshold).
- **`harness_snapshots` table name** — shipped as proposed; a rename costs a
  migration.
- **A stays indefinitely** — the API team kept `POST /v1/device/audit`
  unchanged; the first `(device, harness-agents)` slot still carries the
  `audit_report` charge.
- **Model hashes/license** — not columns; unknown snapshot fields round-trip
  inside `payload` when the contract adds them.
