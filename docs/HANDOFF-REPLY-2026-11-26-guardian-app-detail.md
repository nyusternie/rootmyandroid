<!-- docs/HANDOFF-REPLY-2026-11-26-guardian-app-detail.md -->

# Guardian app detail — REPLY (2026-11-26)

**To:** web/mobile workstream (`rootmyandroid`, `apps/web`)
**Re:** `docs/HANDOFF-2026-11-26-guardian-app-detail.md`
**From:** `rootmyandroid-api`

## Verdict: SHIPPED — `POST /v1/guardian/apps/get` is LIVE; the web-side corrections below remain

The request maps onto the existing `device_audits` row (`audit_type: "guardian-apps"`) with no schema change. The shipped `getGuardianApp` call and the 404/429 fallbacks are correct. The route is live without a web deploy. The corrections below are not blockers for the API; they make the §6 "already shipped" claims accurate.

- API commit: `3ff9c35` — `feat(guardian): read one app from a device's shared inventory`
- Worker version: **`66915247-07fe-4e7d-8ff1-a5967554ffce`**
- CI: https://github.com/nyusternie/rootmyandroid-api/actions/runs/45862228916 (Test & coverage + Deploy to Cloudflare, both green)
- Deployed: 2026-11-26T16:52:30Z (wrangler log)

## Contract as shipped

- Request: `POST /v1/guardian/apps/get` with `{account_number, device_id, package}`.
- `account_number`: normalized to 16 digits; spaces/dashes accepted, same as `/v1/guardian/devices/list`.
- `device_id`: opaque non-empty string, max 128 chars; no UUID shape requirement.
- `package`: max 255 chars, `^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$`; exact, case-sensitive match in the stored snapshot.
- 200: `{ok:true, device:{device_id, device_name}, collected_at, count, app:{package,label,version,system,details:{}}, charged:0}`.
  - `device` comes from `guardian_devices`; `device_name` can be null.
  - `collected_at` is `snapshot.collected_at` when it is a non-empty string, else the row's `collected_at`, else null. This is the value the page already displays for the list (`apps/web/src/scripts/guardian.ts:209`).
  - `count` is `apps.length`, computed server-side; the client-reported `snapshot.count` is not trusted.
  - `app.version` is returned as stored; it can be `null` or `""` (the current uploader sends `""` when `versionName` is null, `apps/guardian-angel/android/app/src/main/java/com/rootmyandroid/guardian_angel/AppInventoryModule.kt:40`). No `String()` coercion.
  - `app.label` can be null; `app.system` is `Boolean(stored.system)`.
  - `app.details` is `{}`; the route whitelists the fields and does not echo extra stored keys.
  - `charged: 0` is additive; the current client ignores it.
- 404 `app_not_found` covers three cases: no `guardian-apps` snapshot for the device, a malformed/unusable snapshot, or the package absent from the snapshot. No new slug, so the current client message covers it (it prompts a fresh share).
- 404 `device_not_found` is returned for a device not paired to this account, including a device paired elsewhere.
- 404 `not_found` remains the route-missing catch-all (`src/index.js:1511`), with `path` in the body. A non-POST request also falls through to this 404; the route does not add `405 method_not_allowed`.
- 429 `rate_limited` includes `retry_after` (seconds). Caps: 60/IP/h and 120/account/h, separate scopes `guardian_app_ip` / `guardian_app_account`; IP cap first, account cap after account lookup. This does not consume the list budget.
- No new storage, no writes to guardian data, no charge. The rate limiter writes its existing `relay_attempts` counters.
- Done in the ship: the `/v1/` discovery entry, the `README.md` route row, and `test/guardian.test.js` coverage.

## Web-side corrections

### 1. Apply `device.device_name` in the 200 branch (code)

§6 says a 200 replaces `device.device_name`. `loadAppDetail` updates `detailTitle`, `detailVersion`, `detailKind`, and `detailShared`, but never `detailDevice` — `apps/web/src/scripts/guardian.ts:405-415`. Add the write, e.g.:

```ts
const servedDevice = res.data?.device as
  | { device_id?: string; device_name?: string | null }
  | undefined
if (servedDevice?.device_name) {
  detailDevice.textContent = `${servedDevice.device_name} — ${shortId(servedDevice.device_id ?? deviceId)}`
}
```

If the team prefers to leave the client unchanged, remove `device.device_name` from §6; the API still returns it.

### 2. Align §6 with the shipped 404/429 messages (docs)

- §6 groups `app_not_found` / `account_not_found` / `device_not_found` under one message. The code uses `app_not_found` for "not in the shared snapshot any more" and the other two for "The account or device was not found — reload the page" — `apps/web/src/scripts/guardian.ts:420-424`. Update §6 to match the code, or change the code to match §6. The current code messages are more precise; recommend updating §6.
- §6's 429 text is "Too many detail requests — wait a minute."; the code says "Too many detail requests — wait a minute, then click again." — `apps/web/src/scripts/guardian.ts:425-426`. Cosmetic; update §6.

### 3. Fix the stale `guardian_apps` comments (docs)

The implemented slug is `guardian-apps` (hyphen) — `apps/guardian-angel/App.tsx:73`; `AUDIT_TYPE_PATTERN` allows hyphens, not underscores (`../rootmyandroid-api/src/lib/audit.js:15`). These comments say `guardian_apps` (underscore):

- `apps/web/src/scripts/guardian.ts:35`
- `apps/web/src/lib/api.js:68`
- `docs/DECISION-2026-11-25-guardian-monitoring.md:73`

The call sites already use `guardian-apps` (`guardian.ts:192`, `App.tsx:73`), so this is docs-only.

## Optional / not requested

- The dialog does not display `count`; the API returns it for a future "1 of 315" line. If the team wants that line now, it is a separate client change.
- The current `api.test.js` covers the request shape only (`apps/web/src/lib/api.test.js:251-270`). A test for the 200 branch applying `device.device_name` and for `version: ""` / `null` would cover correction 1.
- No web deploy is needed to switch the route on. Keep the `404 not_found` branch for rollback; it is also the non-POST catch-all.

## Re-verify (the route is live)

1. Open https://rootmyandroid.com/guardian/, load the account, pick the Pixel 5, click an app.
2. Confirm the dialog shows the server's `label`, `version`, `collected_at`, and `device.device_name`.
3. Confirm a package that is not in the snapshot shows the `app_not_found` message.
4. Confirm the list still pages 20 rows and "Show all apps" still works.

Live curl verification (2026-11-26, after the deploy):

```
$ curl -s -X POST https://rootmyandroid.com/v1/guardian/apps/get \
    -H 'content-type: application/json' --data-binary 'not json'
{"ok":false,"error":"invalid_json"}                       # HTTP 400

$ curl -s -X POST https://rootmyandroid.com/v1/guardian/apps/get \
    -H 'content-type: application/json' -d '{"account_number":"123"}'
{"ok":false,"error":"invalid_account_number"}             # HTTP 400

$ curl -s -X POST https://rootmyandroid.com/v1/guardian/apps/get \
    -H 'content-type: application/json' -d '{"account_number":"0000000000000001"}'
{"ok":false,"error":"account_not_found"}                  # HTTP 404

$ curl -s -X POST https://rootmyandroid.com/v1/guardian/apps/get \
    -H 'content-type: application/json' \
    -d '{"account_number":"0711465548568044","device_id":"8e2c2b1b-a98b-4cea-a3ad-c9f3821dbb2b","package":"com.android.chrome"}'
{
  "ok": true,
  "device": {
    "device_id": "8e2c2b1b-a98b-4cea-a3ad-c9f3821dbb2b",
    "device_name": "Google Pixel 5"
  },
  "collected_at": "2026-11-26T14:56:49.267Z",
  "count": 315,
  "app": {
    "package": "com.android.chrome",
    "label": "Chrome",
    "version": "158.0.8127.42",
    "system": true,
    "details": {}
  },
  "charged": 0
}                                                          # HTTP 200

$ curl -s -X POST https://rootmyandroid.com/v1/guardian/apps/get \
    -H 'content-type: application/json' \
    -d '{"account_number":"0711465548568044","device_id":"8e2c2b1b-a98b-4cea-a3ad-c9f3821dbb2b","package":"com.example.absent"}'
{"ok":false,"error":"app_not_found"}                      # HTTP 404

$ curl -s https://rootmyandroid.com/v1/guardian/apps/get
{"ok":false,"error":"not_found","path":"/v1/guardian/apps/get"}  # HTTP 404 (non-POST)
```

`GET https://rootmyandroid.com/v1/` lists the route:
`/v1/guardian/apps/get (POST) — read one app from a shared inventory`

## Sources

```bash
rg -n "getGuardianApp|loadAppDetail|detailDevice|app_not_found|guardian-apps|guardian_apps" apps/web/src ../rootmyandroid-api/src ../rootmyandroid-api/test docs
```
