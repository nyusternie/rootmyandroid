# Handoff — `POST /v1/guardian/apps/get` (single-app detail)

Status: **REQUESTED** (2026-11-26) · Owner: `rootmyandroid-api` · From: `rootmyandroid` web

## 1. Why

`/guardian` now lists the app inventory the Guardian Angel app shares
(`audit_type: "guardian-apps"`, snapshot `{count, collected_at, apps[]}`) with
20 rows per page and a "Show all apps" toggle. The next step is clicking a row
to see that one app.

The list snapshot already carries `package`, `label`, `version` and `system`,
so the click could be answered client-side. It should not be, for two reasons:

1. The detail view is where **additional per-app detail** will land (owner
   order 2026-11-26: "detailed app information in our own backend, served by
   our API with additional details — to be determined later"). The moment a
   field is not in the list snapshot, a client-side view cannot show it.
2. A single-app lookup must not require shipping the whole 315-row, up-to-512-KB
   snapshot to the browser.

This document is the contract request. The web client ships ahead of it and
degrades honestly while the route answers 404 (see §6).

## 2. Request

```
POST /v1/guardian/apps/get
content-type: application/json

{
  "account_number": "0711465548568044",
  "device_id": "8e2c2b1b-a98b-4cea-a3ad-c9f3821dbb2b",
  "package": "com.android.chrome"
}
```

- `account_number` — 16 digits, the only credential (same rule as
  `/v1/guardian/devices/list`).
- `device_id` — the id the app stores at sync (UUID today, opaque to clients).
- `package` — Android package name; validate
  `^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$`, max 255 chars. It is looked up
  in the stored snapshot, never used as a path or SQL fragment.

## 3. Response — 200

```json
{
  "ok": true,
  "device": { "device_id": "8e2c2b1b-a98b-4cea-a3ad-c9f3821dbb2b", "device_name": "Google Pixel 5" },
  "collected_at": "2026-11-26T02:24:55.356Z",
  "count": 315,
  "app": {
    "package": "com.android.chrome",
    "label": "Chrome",
    "version": "120.0.6099.144",
    "system": true,
    "details": {}
  }
}
```

- `device` — from the same device registry `/v1/guardian/devices/list` reads.
  `device_name` may be `null`.
- `collected_at` — timestamp of the snapshot the row came from (the list's
  `collected_at`), ISO-8601 UTC.
- `count` — how many apps that snapshot holds, so the client can say
  "1 of 315".
- `app.version` — **may be `null`** (the app sends what PackageManager
  reports; a missing version must not become the string "null").
- `app.details` — **reserved, `{}` today.** A JSON object for the additional
  per-app detail (owner decision: fields TBD). Two rules:
  - the API may add keys at any time without a client change;
  - clients must render only the keys they know and ignore the rest, so
    adding a field is not a breaking change.
  Candidate fields for a later round (NOT collected today — do not invent
  values for them): `install_source`, `first_seen`, `last_updated`,
  `target_sdk`, `permissions`. Each needs an owner ruling on collection before
  it is served (docs/DECISION-2026-11-25-guardian-monitoring.md, Q1/Q3/Q4).

## 4. Errors

| status | `error`                  | when |
| ------ | ------------------------ | ---- |
| 400    | `invalid_account_number` | not 16 digits |
| 400    | `invalid_device_id`      | missing / malformed |
| 400    | `invalid_package`        | fails the pattern above |
| 404    | `account_not_found`      | no such account |
| 404    | `device_not_found`       | device not paired to this account (also used for a device paired elsewhere — no cross-account enumeration) |
| 404    | `app_not_found`          | the snapshot exists but holds no such package |
| 404    | `not_found`              | route not deployed (what the client sees today) |
| 429    | `rate_limited`           | see §5 |
| 405    | `method_not_allowed`     | not POST |

All error bodies keep the existing shape: `{ "ok": false, "error": "<slug>" }`.

## 5. Rate limits (proposal)

Click-through traffic, not page-load traffic: **60/IP/hour** and
**120/account/hour** (the list routes use 20/30). Counters are per route, so
browsing details does not consume the list budget. Adjust if the API team
prefers one shared budget — the client only needs 429 to be distinguishable
from 404.

## 6. Client behaviour (already shipped)

`apps/web/src/lib/api.js` → `getGuardianApp(account, deviceId, package)`.
Clicking a row opens a dialog filled from the list snapshot immediately, then:

- **200** → the dialog's fields are replaced with the server's values
  (`label`, `version`, `collected_at`, `device.device_name`).
- **404 `not_found`** → the dialog keeps the snapshot values and says
  "The detail endpoint is not deployed yet — showing the shared snapshot."
- **404 `app_not_found` / `account_not_found` / `device_not_found`** → the
  dialog says the app is no longer in the shared snapshot.
- **429** → "Too many detail requests — wait a minute."
- anything else / network error → snapshot values + a neutral note.

So the endpoint can ship at any time; no web deploy is needed to switch on.

## 7. What is explicitly NOT requested

- No new storage: read the existing `guardian-apps` audit row.
- No charging: `charged: 0`, like the rest of the audit surface.
- No writes, no device commands, no uninstall-from-web.
- No new collection: `details` starts empty and stays empty until a field is
  ruled on.
