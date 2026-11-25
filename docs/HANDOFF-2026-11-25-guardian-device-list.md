# HANDOFF — Guardian Angel: list an account's paired devices

**To:** rootmyandroid-api (owning team)
**From:** rootmyandroid web/mobile workstream
**Date:** 2026-11-25
**Status:** requested — the web page `/guardian` is built against this contract

## Why

The web platform has a control page per product: `/terminal` for Rootz
(pair the relay device, then open a shell) and now `/guardian` for
Guardian Angel. The Rootz picker is powered by
`POST /v1/relay/devices/list` (added 2026-11-10 for the same reason).

Guardian has `POST /v1/guardian/sync` (pairing) but **no list route**, so
the `/guardian` device picker has nothing to read. `GET /v1/accounts/{n}`
returns only credit days / halo balance / created_at.

Today the page shows: "Device list isn't live yet — API handoff pending",
with a Retry button. It needs one endpoint to become useful.

## Contract

`POST /v1/guardian/devices/list`

Request body (account number is the only credential; it must travel in the
body, never the URL — same convention as `/v1/backups/list` and
`/v1/relay/devices/list`):

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
      "device_id": "0f1c9c1e-6a7f-4a54-9d9e-2c1c1d6a1b0e",
      "device_name": "Pixel 5",
      "created_at": "2026-11-25T18:04:11.220Z"
    }
  ]
}
```

Errors, in this order (mirrors the relay list handler):

| status | body | when |
| --- | --- | --- |
| 400 | `{"ok":false,"error":"invalid_json"}` | body is not JSON |
| 429 | `{"ok":false,"error":"rate_limited","retry_after":N}` | per-IP cap first, then per-account |
| 400 | `{"ok":false,"error":"invalid_account_number"}` | not 16 digits after normalization |
| 404 | `{"ok":false,"error":"account_not_found"}` | unknown account |
| 200 | list above | ok (empty list is valid) |

Ordering: newest first (`ORDER BY created_at DESC, rowid DESC`).

Rate limits: reuse the relay constants (20/IP/hour, 30/account/hour) or
pick your own — the page debounces (one request per completed number, plus
the manual Refresh button), same as `/terminal`.

## Suggested patch (copy-paste)

`src/lib/guardian.js` — add:

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

`src/index.js` — import `listGuardianDevices` next to `findDevice`,
`syncDevice`, add the handler next to `handleGuardianSync`:

```js
// POST /v1/guardian/devices/list — the devices paired to an account
// (web /guardian picker). The account number is the only secret; it stays
// in the body. Same rate-limit shape as /v1/relay/devices/list.
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
  const ipLimit = await hitRateLimit(env.DB, 'guardian_list_ip', ipSubject, LIST_MAX_PER_IP_PER_HOUR, now)
  if (ipLimit.limited) {
    recordEvent(env, ctx, 'guardian_rate_limited', { detail: 'list_ip' })
    return json({ ok: false, error: 'rate_limited', retry_after: ipLimit.retryAfter }, { status: 429 })
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
    env.DB, 'guardian_list_account', accountNumber, LIST_MAX_PER_ACCOUNT_PER_HOUR, now
  )
  if (accountLimit.limited) {
    recordEvent(env, ctx, 'guardian_rate_limited', { detail: 'list_account' })
    return json({ ok: false, error: 'rate_limited', retry_after: accountLimit.retryAfter }, { status: 429 })
  }
  const devices = await listGuardianDevices(env.DB, accountNumber)
  return json({ ok: true, account_number: formatAccountNumber(accountNumber), devices }, { status: 200 })
}
```

Route it next to the sync route:

```js
if (path === '/guardian/devices/list' && request.method === 'POST') {
  return handleGuardianListDevices(request, env, ctx)
}
```

Add it to the route table in the `/v1` discovery payload:

```
'/v1/guardian/devices/list (POST) — list paired Guardian devices for an account',
```

## Tests to add (`test/`)

1. unknown account → 404 `account_not_found`
2. bad number (`"123"`) → 400 `invalid_account_number`
3. empty account → `{ok:true, devices: []}`
4. two syncs → two rows, newest first
5. re-sync of the same `device_id` → still one row (idempotent)
6. rate limit: 21st call from one IP → 429 with `retry_after`

## Notes

- Charging is frozen (`consumeHalo` returns `charged: 0`), so this
  endpoint must NOT charge anything.
- `guardian_devices` has no revoked/soft-delete column; the page shows
  every row. If a delete route is ever added, mirror
  `/v1/relay/devices/{id}` (DELETE, account in body, 404 for
  unknown/cross-account).
- The web page is `apps/web/src/pages/guardian.astro` +
  `src/scripts/guardian.ts`, client helper
  `listGuardianDevices()` in `apps/web/src/lib/api.js`.
