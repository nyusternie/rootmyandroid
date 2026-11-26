<!-- docs/HANDOFF-ACK-2026-11-26-harness-rate-limits.md -->

# ACK / REVIEW — Harness heartbeat rate-limit reply

**To:** API team (`rootmyandroid-api`)
**From:** web + Android workstream (`rootmyandroid`)
**Date:** 2026-11-26
**Re:** `rootmyandroid-api/docs/HANDOFF-REPLY-2026-11-26-harness-rate-limits.md`
**Status:** reviewed. 300/300 applied and verified. No API-side open items.
One product decision remains on the five-device cap.

Per `AGENTS.md` rule 9 this repo did not edit `rootmyandroid-api`.

---

## 1. What we verified

- `rootmyandroid-api/src/lib/harness.js` exports
  `HARNESS_HEARTBEAT_MAX_PER_IP_PER_HOUR = 300` and
  `HARNESS_HEARTBEAT_MAX_PER_ACCOUNT_PER_HOUR = 300`; the list limits are
  unchanged at 20/h/IP and 30/h/account.
- `test/harness.test.js` pins both constants at 300 and seeds the hashed
  IP subject for the per-IP 429 test; the account 429 test follows the
  exported account constant.
- The API reply records CI `45898642676` green and a live 61/61 heartbeat
  burst under one IP/account; the previous 60/h/IP cap would have returned
  429 on the 61st.
- The deployed route catalog still lists both harness routes; no schema or
  response-shape change.

We did not repeat the write burst without an account; the API team's live
check and test suite cover it.

---

## 2. Properties accepted

### 2.1 300/h is a hard edge

`hitRateLimit` increments before payload validation, and the window is
anchored at `floor(now/3600)*3600`, so five devices at 60 s can produce 301
attempts in a boundary window. The tool now honors `retry_after` and backs
off; a missed heartbeat in that window leaves the previous snapshot in place.
For a registry page, that is acceptable. If it shows up in the field, the
reply's 360/400 one-line bump is the remedy.

### 2.2 The IP budget is shared across accounts

`relayIpSubject` hashes IP + User-Agent + window, not the account. Five
devices at 60 s consume the whole 300/h IP budget, so a second account behind
the same NAT with the same User-Agent gets 429 on its first heartbeat.

The target is one Rootz account per IP, so this is accepted for now. If
multi-account/CGNAT deployment appears, the IP cap needs headroom above the
account cap (for example, 600/h for two five-device accounts); the account
cap stays at 300/h. This is a future request, not a change to the current
ruling.

---

## 3. Product decision — the five-device cap is not enforced here

The reply's §6 is correct. `AGENTS.md` scopes “Each account links up to 5
devices” to `POST /v1/guardian-angel/sync`; the harness path uses
`relay_devices`, and `pairDevice` (`src/lib/relay.js`) has no device-count
check. An account can pair more than five relay devices today.

The 300/h account cap is sized for five devices at 60 s. A sixth device at
60 s puts the account at 360/h and into 429 territory, so the rate limit
throttles the sixth device rather than refusing the pairing.

This is a product policy gap, not a rate-limit defect. The owner ruled on
2026-11-26: **hard cap of five, oldest automatically drops out.** The
request is `docs/HANDOFF-2026-11-26-harness-pair-cap.md`; the rate-limit
request stays closed.

---

## 4. Operational note

The reply's §8 says the throwaway verification account remains in production
with one harness snapshot, and there is no account-delete route. The account
number is deliberately not copied into this public repo. It is a test
account with no GURU balance; the snapshot is a mock device id. No action is
required for the feature.

---

## 5. Status

- Rate-limit request: **APPLIED** — `rootmyandroid-api` commit `8172e88`,
  CI `45898642676`.
- API-side open items: **none**.
- Web/tool side: no change required; the tool warning is already
  limit-agnostic and the `retry_after` backoff is shipped.
- Product-side follow-up: the hard five-device relay cap is requested in
  `docs/HANDOFF-2026-11-26-harness-pair-cap.md` (oldest drops out).
