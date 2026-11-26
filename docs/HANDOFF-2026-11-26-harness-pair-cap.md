<!-- docs/HANDOFF-2026-11-26-harness-pair-cap.md -->

# HANDOFF — Hard 5-device relay pairing cap (oldest drops out)

**To:** API team (`rootmyandroid-api`)
**From:** web + Android workstream (`rootmyandroid`)
**Date:** 2026-11-26
**Status:** REQUESTED. Owner ruling, 2026-11-26, verbatim: **“YES! i want a
HARD pairDevice cap of 5 the OLDEST automatically drops out”**.

Per `AGENTS.md` rule 9 this document is the write channel into
`rootmyandroid-api`. Nothing below has been applied to that repo.

---

## 1. Scope

`pairDevice` (`src/lib/relay.js`) behind `POST /v1/relay/devices` — the Rootz
relay pairing path. This is the path the Rootz app and `rootzd` use.

- It applies to **all relay devices**, not just harness devices.
- The Guardian Angel sync path (`POST /v1/guardian-angel/sync`) is unchanged;
  its existing five-device rule stays where it is.
- The relay list (`POST /v1/relay/devices/list`) already returns active
  devices newest first; after this cap it returns at most five.
- The kill-switch revoke route is unchanged.

---

## 2. Required behavior

Definitions:

- **Active** = `revoked_at IS NULL`. Revoked rows are the permanent kill-switch
  history; they do not count toward the cap.
- **Oldest** = `ORDER BY created_at ASC, id ASC LIMIT 1` among the account's
  active rows (`id` is the `INTEGER PRIMARY KEY AUTOINCREMENT` tiebreaker).

Pairing a **new** device (a public key with no existing row):

| active devices before | result |
| --- | --- |
| 0–4 | insert the new row; `201`; no eviction |
| 5 | delete the oldest active row, insert the new row; `201`; return the evicted device |

Pairing an **existing active** device (same key, same account): return `200`
with the existing row; **no eviction**. Re-pairing the oldest device does not
evict it.

Pairing an existing **revoked** device: keep the current `403 device_revoked`.
Pairing a key bound to **another account**: keep the current
`409 device_already_paired`.

After every successful pair, the account has **at most five active rows**.
The delete + insert MUST be atomic (a D1 batch/transaction); a concurrent
pair must not leave six rows or evict two devices for one insert.

**Eviction is a hard delete, not `revoked_at`.** The evicted device drops out
of the account and its key becomes free to pair again later; a later re-pair
is a new row and evicts the then-oldest. Do not use the permanent kill-switch
semantics for automatic eviction.

---

## 3. Response

Keep the current response fields; add two additive fields:

```json
{
  "ok": true,
  "device_id": "<new device id>",
  "account_number": "1234 5678 9012 3456",
  "device_name": "Pixel 7",
  "created_at": "2026-11-26T22:00:00.000Z",
  "evicted_device_id": "<oldest device id or null>",
  "evicted_device_name": "<oldest device name or null>"
}
```

`evicted_device_id` / `evicted_device_name` are `null` (or omitted) when no
eviction happened. The Rootz app uses `evicted_device_name` to tell the user
which device dropped; the name may be null, in which case the app falls back
to the id prefix.

Status: `201` when a row was created, `200` for an idempotent re-pair, as
today.

---

## 4. Existing accounts with more than five active devices

The cap is not enforced today; an account can have six or more active relay
rows. The deploy needs a one-time backfill:

- For each account with more than five active rows, keep the **newest five**
  (`created_at DESC, id DESC`) and delete the rest.
- Do not delete revoked rows; they are the kill-switch history.
- Report the number of accounts and rows trimmed.

The backfill is silent for the evicted devices; their next challenge returns
`404 device_not_found`, which the Rootz app handles as “dropped” (see §5).

---

## 5. Client follow-up (shipped in this repo)

- `apps/rootz/app/src/main/java/com/rootmyandroid/rootz/RelayDaemon.kt` reads
  `evicted_device_name` from the `201` response and shows “dropped <name>
  (5-device limit)” in the relay status/receipt log.
- An evicted device’s challenge returns `404 device_not_found`. The app parks
  with “this device was dropped by a newer pairing (5-device limit) — tap
  Start relay to re-pair”, clears the paired marker, and writes a `dropped`
  marker so a reboot does not auto-repair in a loop.
- `MainActivity.kt` clears the `dropped` marker on the **Start relay** tap;
  that pair evicts the then-oldest device.
- No API change beyond §2/§3 is needed for this UX.

---

## 6. Tests and verification

API tests:

- five active devices + a sixth new device → `201`, one row deleted, five
  active, `evicted_device_id` is the oldest;
- re-pair an existing active device → `200`, no deletion;
- revoked rows do not count → four active + one revoked + a new device → no
  eviction;
- concurrent new pairs → at most five active after both;
- backfill fixture with six active rows → five newest remain;
- the evicted device’s challenge → `404 device_not_found`;
- the evicted key can pair again later (new row, evicts the then-oldest).

Production check with a throwaway account:

1. Pair five test keys; list returns five.
2. Pair a sixth; response names the oldest; list returns five and the oldest
   is gone.
3. Challenge the evicted id → `404 device_not_found`.
4. Re-pair the evicted key; it returns, and the then-oldest drops.

---

## 7. Why this is separate from the rate-limit ruling

The 300/h account heartbeat cap is sized for five devices at 60 s. It throttles
a sixth device but does not refuse the pairing. This request makes the
five-device rule a real server-side invariant on the relay path; the rate
limits stay as shipped (300/300 heartbeat, 20/30 list).
