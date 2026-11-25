<!-- docs/HANDOFF-REPLY-2026-11-25-guardian-device-list.md -->

# Guardian Angel device list — REPLY (2026-11-25)

**To:** web/mobile workstream (`rootmyandroid`, `apps/web` + `apps/guardian-angel`)
**Re:** `docs/HANDOFF-2026-11-25-guardian-device-list.md`
**From:** `rootmyandroid-api`

## Verdict: SHIPPED — `POST /v1/guardian/devices/list` is LIVE

- API commit: `38702d8` — `feat(guardian): list an account's paired devices`
- Worker version: **`5f680394-7428-410b-b4ba-e48bfbd783cb`**
- CI: https://github.com/nyusternie/rootmyandroid-api/actions/runs/45693676793
  (Test & coverage + Deploy to Cloudflare, both green)
- Deployed: 2026-11-25T20:24:48Z (wrangler log)

No client change is needed: `apps/web/src/lib/api.js` already calls
`/guardian/devices/list`, and `apps/web/src/scripts/guardian.ts` already
renders the response.

## Live verification (run after the deploy)

```
$ curl -s -X POST https://rootmyandroid.com/v1/guardian/devices/list \
    -H 'content-type: application/json' --data-binary 'not json'
{"ok":false,"error":"invalid_json"}                       # HTTP 400

$ curl -s -X POST https://rootmyandroid.com/v1/guardian/devices/list \
    -H 'content-type: application/json' -d '{"account_number":"123"}'
{"ok":false,"error":"invalid_account_number"}             # HTTP 400

$ curl -s -X POST https://rootmyandroid.com/v1/guardian/devices/list \
    -H 'content-type: application/json' -d '{"account_number":"0000000000000000"}'
{"ok":false,"error":"account_not_found"}                  # HTTP 404
```

The account from §0 returns the paired Pixel 5 row:

```json
{
  "ok": true,
  "account_number": "0711 4655 4856 8044",
  "devices": [
    {
      "device_name": "Google Pixel 5",
      "device_id": "8e2c2b1b-…",
      "created_at": "2026-11-25T19:52:32.676Z"
    }
  ]
}
```

`GET https://rootmyandroid.com/v1/` lists the route:

```
/v1/guardian/devices/list (POST) — list paired Guardian devices for an account
```

(`GET /v1` without the trailing slash is the Pages catch-all 404 — the
discovery payload has always been served at `/v1/`.)

## Contract as shipped

- Request: `{"account_number":"0711 4655 4856 8044"}`. Spaces or raw
  digits; the API normalizes to 16 digits.
- 200: `{ok:true, account_number, devices:[{device_id, device_name,
  created_at}]}`; an empty list is a valid 200.
- Ordering: `created_at DESC, rowid DESC` (newest first).
- Errors: `400 invalid_json`; `429 rate_limited` with `retry_after`
  (per-IP 20/h first, then per-account 30/h); `400
  invalid_account_number`; `404 account_not_found`.
- The per-account cap is checked after the account exists, exactly like
  `/v1/relay/devices/list`. Unknown accounts burn only the per-IP budget.
- Device rows carry only the three public fields; the account number stays
  in the response envelope.
- A JSON `null` body returns `400 invalid_account_number` (not a 500).

## Tests

`test/guardian.test.js` now has 9 list tests: newest-first + three-field
rows, empty list, re-sync idempotency, unknown 404, invalid 400, invalid
JSON 400, JSON null body 400, per-IP 429 before validation, per-account
429. `test/index.test.js` asserts the discovery entry. CI is green.

## Done criteria

- [x] `POST /v1/guardian/devices/list` answers the contract
- [x] the tests are green in CI
- [x] the route is listed in the `/v1` discovery payload
- [x] production lists the paired device for the synced account

## Notes / not in scope

- The list returns every historical pairing: `guardian_devices` has no
  `revoked_at`/`last_seen` column, and a fresh install that omits the
  stored `device_id` gets a new UUID. Rename, unlink and staleness remain
  the §7 follow-ups.
- The page's generic "not live yet" 404 branch is now unreachable for this
  endpoint; the `account_not_found` branch handles unknown accounts.

## Re-verify

Open https://rootmyandroid.com/guardian/, enter the account, and the
picker must show "Google Pixel 5 — 8e2c2b1b…". Reply here if anything
differs.
