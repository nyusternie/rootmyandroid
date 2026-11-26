# Handoff — `POST /v1/guardian/apps/get` (single-app detail)

Status: **REVIEWED BY API — shipping** (2026-11-26). Reply:
`docs/HANDOFF-REPLY-2026-11-26-guardian-app-detail.md`. The three web-side
corrections in that reply are applied (§8). · Owner: `rootmyandroid-api` ·
From: `rootmyandroid` web

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
  `/v1/guardian/devices/list`). Spaces and dashes are accepted and normalized
  to 16 digits.
- `device_id` — opaque non-empty string, max 128 chars (a UUID today). No
  shape requirement is imposed on it.
- `package` — Android package name; validate
  `^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$`, max 255 chars, matched
  case-sensitively and exactly against the stored snapshot. It is never used
  as a path or SQL fragment.

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
  },
  "charged": 0
}
```

- `device` — from the same device registry `/v1/guardian/devices/list` reads.
  `device_name` may be `null`.
- `collected_at` — ISO-8601 UTC: the snapshot's own `collected_at` when it is
  a non-empty string, else the audit row's `collected_at`, else `null`.
- `count` — `apps.length` computed **server-side** (the client-reported
  `snapshot.count` is not trusted), so the page can say "1 of 315".
- `app.label` — **may be `null`**.
- `app.version` — returned as stored: **`null` or `""`** both occur today
  (`AppInventoryModule.kt` sends `versionName ?: ""`). No `String()`
  coercion, and a missing version must never render as "null".
- `charged` — additive `0` (the audit surface never charges); the current
  client ignores it.
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
| 404    | `app_not_found`          | no usable `guardian-apps` snapshot for the device (missing or malformed), or the package is absent from it |
| 404    | `not_found`              | route not deployed (what the client sees today) |
| 429    | `rate_limited`           | see §5; the body also carries `retry_after` (seconds) |

There is deliberately **no 405**: a non-POST request falls through to the
route-missing `404 not_found`, which is also the rollback signal. All error
bodies keep the existing shape `{ "ok": false, "error": "<slug>" }`, and the
`not_found` catch-all adds `path`.

## 5. Rate limits (proposal)

Click-through traffic, not page-load traffic: **60/IP/hour** and
**120/account/hour** (the list routes use 20/30), in separate scopes
(`guardian_app_ip` / `guardian_app_account`, IP checked first) — accepted as
proposed, so browsing details does not consume the list budget. The client
only needs 429 to be distinguishable from 404.

## 6. Client behaviour (already shipped)

`apps/web/src/lib/api.js` → `getGuardianApp(account, deviceId, package)`.
Clicking a row opens a dialog filled from the list snapshot immediately, then:

- **200** → the dialog's fields are replaced with the server's values
  (`label`, `version`, `system`, `collected_at`, `device.device_name` — the
  registry label wins over the picker's, since a device can be renamed
  between the list load and the click).
- **404 `not_found`** → the dialog keeps the snapshot values and says
  "The detail endpoint is not deployed yet — showing the shared snapshot."
- **404 `app_not_found`** → "This app is not in the shared snapshot any
  more — open Guardian Angel on the phone to share a fresh one."
- **404 `account_not_found` / `device_not_found`** → "The account or device
  was not found — reload the page."
- **429** → "Too many detail requests — wait a minute, then click again."
- anything else / network error → snapshot values + a neutral note.

So the endpoint can ship at any time; no web deploy is needed to switch on.

## 7. What is explicitly NOT requested

- No new storage: read the existing `guardian-apps` audit row.
- No charging: `charged: 0`, like the rest of the audit surface.
- No writes, no device commands, no uninstall-from-web.
- No new collection: `details` starts empty and stays empty until a field is
  ruled on.

## 8. Reply reviewed (2026-11-26)

`docs/HANDOFF-REPLY-2026-11-26-guardian-app-detail.md` read against the code;
all three corrections were real and are applied in the same commit:

1. **`device.device_name` was never written** — `loadAppDetail`'s 200 branch
   updated title/version/kind/shared but not the device row, so §6 was
   claiming behaviour the code did not have. Fixed in
   `apps/web/src/scripts/guardian.ts` (the registry name now wins over the
   picker's).
2. **§6 did not match the shipped 404/429 copy** — the code distinguishes
   `app_not_found` from `account_not_found` / `device_not_found`, and its 429
   line ends "…, then click again." The code messages are the more precise
   ones; §6 now quotes them.
3. **Stale `guardian_apps` (underscore) comments** — the implemented slug is
   `guardian-apps`, and `AUDIT_TYPE_PATTERN` allows hyphens only. Fixed in
   `guardian.ts` (2 comments, the reply found 1), `api.js` and
   `docs/DECISION-2026-11-25-guardian-monitoring.md`; call sites were already
   correct.

Contract details the reply settled are folded into §2–§5 above: account
normalization, opaque `device_id` (≤128), case-sensitive package match,
`charged: 0`, the `collected_at` fallback chain, server-computed `count`,
`label` nullable and `version` `null` **or** `""`, `app_not_found` covering a
missing/malformed snapshot, no 405 (non-POST → `404 not_found`), and
`retry_after` on 429.

Verified on our side before accepting: `AppInventoryModule.kt` really sends
`pkg.versionName ?: ""`, `AUDIT_TYPE_PATTERN` is `/^[a-z][a-z0-9-]{0,31}$/`,
and the live route answers `404 {"ok":false,"error":"not_found","path":"/v1/guardian/apps/get"}`.
Re-verification after the API deploy follows the reply's four steps.
