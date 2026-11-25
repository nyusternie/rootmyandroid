<!-- docs/HANDOFF-2026-11-25-guardian-device-list.md -->

# HANDOFF — Guardian Angel: list an account's paired devices

**To:** API team (`rootmyandroid-api`)
**From:** web/mobile workstream (`rootmyandroid`, apps/web + apps/guardian-angel)
**Date:** 2026-11-25
**Status:** RESOLVED 2026-11-25 (API team) — `POST /v1/guardian/devices/list`
deployed (worker `5f680394-7428-410b-b4ba-e48bfbd783cb`, commit `38702d8`).
Reply: `docs/HANDOFF-REPLY-2026-11-25-guardian-device-list.md`. Re-verified
from this side the same day — see §8.

Per `AGENTS.md` rule 9 this document is the only write channel into the API
repo. Everything below is verifiable from the paths and commands quoted.

---

## 0. Context and evidence

The web platform has one control page per product:

| product | control page | device source |
| --- | --- | --- |
| Rootz | `/terminal` (live) | `POST /v1/relay/devices/list` |
| Guardian Angel | `/guardian` (live, blocked) | **missing** |

`/guardian` (apps/web/src/pages/guardian.astro + src/scripts/guardian.ts)
asks the account number, then fills a device `<select>` — the same UX as
`/terminal`, which was unblocked by `/v1/relay/devices/list` on 2026-11-10.

What exists on the Guardian side today (`rootmyandroid-api/src`):

- `POST /v1/guardian/sync` — `handleGuardianSync` (src/index.js:261) pairs a
  device; `src/lib/guardian.js` has `findDevice` and `syncDevice`.
- Table `guardian_devices`: `device_id` (UUID), `account_number`,
  `device_name`, `created_at`. No revoked/soft-delete column.
- **No list route.** `GET /v1/accounts/{number}` returns only
  `account_number`, `credit_days`, `halo_balance`, `created_at`.

Live probes (2026-11-25, from this workstation):

```
$ curl -s -X POST https://rootmyandroid.com/v1/guardian/sync \
    -H 'content-type: application/json' -d '{"account_number":"0000000000000000"}'
{"ok":false,"error":"account_not_found"}          # route exists

$ curl -s -X POST https://rootmyandroid.com/v1/guardian-angel/sync \
    -H 'content-type: application/json' -d '{"account_number":"0000000000000000"}'
{"ok":false,"error":"not_found","path":"/v1/guardian-angel/sync"}
```

Two findings worth recording:

1. The Guardian app was posting to `/v1/guardian-angel/sync` — a path that
   has never been routed, so app sync had never worked. Fixed on our side
   (`apps/guardian-angel/App.tsx`, release `26.11.30`), no API change
   needed.
2. A real sync from a Pixel 5 (redfin, Android 14) now succeeds: the app
   stored `device_id 8e2c2b1b-…` for its account, so `guardian_devices`
   already has a row the page could list.

Charging is frozen (`src/lib/halo.js:192 consumeHalo` returns
`charged: 0`), so nothing here should charge.

---

## 1. What we need

One endpoint: **`POST /v1/guardian/devices/list`**.

It must be a POST with the account number in the JSON body — the account
number is the only secret and must not travel in a URL or logs. Same
convention as `/v1/backups/list` and `/v1/relay/devices/list`.

---

## 2. Contract

Request:

```json
{ "account_number": "0711 4655 4856 8044" }
```

200:

```json
{
  "ok": true,
  "account_number": "0711 4655 4856 8044",
  "devices": [
    {
      "device_id": "8e2c2b1b-a98b-4cea-a3ad-c9f3821dbb2b",
      "device_name": "Google Pixel 5",
      "created_at": "2026-11-25T19:42:07.911Z"
    }
  ]
}
```

Errors, in this order (mirrors `handleRelayListDevices`, src/index.js:1091):

| status | body | when |
| --- | --- | --- |
| 400 | `{"ok":false,"error":"invalid_json"}` | body is not JSON |
| 429 | `{"ok":false,"error":"rate_limited","retry_after":N}` | per-IP cap first, then per-account |
| 400 | `{"ok":false,"error":"invalid_account_number"}` | not 16 digits after `normalizeAccountNumber` |
| 404 | `{"ok":false,"error":"account_not_found"}` | unknown account |
| 200 | list above | ok — an empty list is a valid 200 |

Ordering: newest first (`ORDER BY created_at DESC, rowid DESC`).
`devices` may be `[]`; the page renders "No devices on this account yet".

Rate limits: reuse the relay constants (20/IP/hour, 30/account/hour) or
pick your own. The page debounces — one request per completed 16-digit
number, plus a manual **Refresh list** button — exactly like `/terminal`.

---

## 3. Reference implementation (copy-paste)

`src/lib/guardian.js` — add next to `syncDevice`:

```js
/**
 * List the devices paired to an account, newest first.
 * @param {D1Database} db
 * @param {string} accountNumber
 * @returns {Promise<object[]>}
 */
export async function listGuardianDevices(db, accountNumber) {
  const num = normalizeAccountNumber(accountNumber)
  const { results } = await db
    .prepare(
      `SELECT ${DEVICE_COLUMNS} FROM guardian_devices
       WHERE account_number = ?
       ORDER BY created_at DESC, rowid DESC`
    )
    .bind(num)
    .all()
  return results
}
```

`src/index.js` — extend the import (line 10) and add the handler next to
`handleGuardianSync`:

```js
import { findDevice, listGuardianDevices, syncDevice } from './lib/guardian.js'
```

```js
// POST /v1/guardian/devices/list — the devices paired to an account (web
// /guardian picker). The account number is the only secret; it stays in the
// body. Same rate-limit shape as /v1/relay/devices/list.
async function handleGuardianListDevices(request, env, ctx) {
  await ensureSchemaOnce(env.DB)
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const now = Math.floor(Date.now() / 1000)
  const ipSubject = await relayIpSubject(request, env, 'guardian_list_ip', now)
  const ipLimit = await hitRateLimit(
    env.DB,
    'guardian_list_ip',
    ipSubject,
    LIST_MAX_PER_IP_PER_HOUR,
    now
  )
  if (ipLimit.limited) {
    recordEvent(env, ctx, 'guardian_rate_limited', { detail: 'list_ip' })
    return json(
      { ok: false, error: 'rate_limited', retry_after: ipLimit.retryAfter },
      { status: 429 }
    )
  }

  const accountNumber = normalizeAccountNumber(body.account_number || '')
  if (!isValidAccountNumber(accountNumber)) {
    return json({ ok: false, error: 'invalid_account_number' }, { status: 400 })
  }
  const account = await getAccount(env.DB, accountNumber)
  if (!account) {
    return json({ ok: false, error: 'account_not_found' }, { status: 404 })
  }

  const accountLimit = await hitRateLimit(
    env.DB,
    'guardian_list_account',
    accountNumber,
    LIST_MAX_PER_ACCOUNT_PER_HOUR,
    now
  )
  if (accountLimit.limited) {
    recordEvent(env, ctx, 'guardian_rate_limited', { detail: 'list_account' })
    return json(
      { ok: false, error: 'rate_limited', retry_after: accountLimit.retryAfter },
      { status: 429 }
    )
  }

  const devices = await listGuardianDevices(env.DB, accountNumber)
  return json(
    { ok: true, account_number: formatAccountNumber(accountNumber), devices },
    { status: 200 }
  )
}
```

Route it next to the sync route (`src/index.js:1373`):

```js
if (path === '/guardian/devices/list' && request.method === 'POST') {
  return handleGuardianListDevices(request, env, ctx)
}
```

Add it to the `/v1` discovery payload route table (`src/index.js:1321`,
right after the guardian sync line):

```
'/v1/guardian/devices/list (POST) — list paired Guardian devices for an account',
```

---

## 4. Tests to add (`test/`)

1. unknown account → 404 `account_not_found`
2. `"123"` → 400 `invalid_account_number`
3. account with no devices → `{ok:true, devices:[]}` (200)
4. two syncs → two rows, newest first
5. re-sync with the same `device_id` → still one row (idempotent)
6. 21st call from one IP within the hour → 429 with `retry_after`

---

## 5. What the page does today (so you can verify end-to-end)

`https://rootmyandroid.com/guardian/`:

- 16-digit input, auto-load at the 16th digit (450 ms debounce), **Refresh
  list**, device `<select>`, device card (name / paired date / full id).
- With the route missing it shows:
  *"The device list is not live yet — the API route is pending. Retry after
  the next API deploy."*
- With the route live and a device present it should show
  *"Google Pixel 5 — 8e2c2b1b…"* in the picker.

Client helper: `apps/web/src/lib/api.js` → `listGuardianDevices()`.

---

## 6. Done criteria / reply

Done when:

- [ ] `POST /v1/guardian/devices/list` answers the contract above
- [ ] the six tests are green in CI
- [ ] the route is listed in the `/v1` discovery payload
- [ ] `https://rootmyandroid.com/guardian/` lists the paired device for a
      synced account (no client change needed)

Reply with the deployed version id; we will re-verify the page against
production and close this out.

## 7. Not in scope (flagged for a later handoff)

- Rename a device (`PATCH /v1/guardian/devices/{id}`).
- Unlink a device (would mirror `DELETE /v1/relay/devices/{id}`; the table
  has no soft-delete column today).
- Monitoring feature flags per device — the app currently owns all
  on-device settings, and the page says so.

---

## 8. Resolution — re-verified from this side (2026-11-25)

Probes against production, after the reply's deploy:

| call | result |
| --- | --- |
| `--data-binary 'not json'` | 400 `invalid_json` |
| `{"account_number":"123"}` | 400 `invalid_account_number` |
| `{"account_number":"0000000000000000"}` | 404 `account_not_found` |
| `--data-binary 'null'` | 400 `invalid_account_number` (no 500) |
| the synced account | 200, one row: `Google Pixel 5`, `8e2c2b1b-…`, `created_at 2026-11-25T19:52:32.676Z` |
| `GET /v1/` | discovery lists `/v1/guardian/devices/list (POST)` |

Page check (`https://rootmyandroid.com/guardian/`, Chrome CDP, 1280 px):

```
status : Device loaded — see below.
picker : Google Pixel 5 — 8e2c2b1b…
name   : Google Pixel 5
paired : Nov 25, 2026
id     : 8e2c2b1b-a98b-4cea-a3ad-c9f3821dbb2b
```

Source review (read-only): `src/index.js:308` handler, route at `:1440`,
discovery entry at `:1382`, `listGuardianDevices` in `src/lib/guardian.js:80`,
nine list tests in `test/guardian.test.js:189`. Per-IP cap precedes account
lookup, per-account cap follows it — unknown accounts burn only the per-IP
budget, as the reply states.

Not independently verifiable: the worker version id — `GET /v1/health`
reports `"version": "v1"` only. Everything behavioural matches.

Remaining (the reply's §7, unchanged): rename, unlink, and staleness of rows
left behind by a reinstall (a fresh install without the stored `device_id`
gets a new UUID, so the picker can show a stale sibling).
