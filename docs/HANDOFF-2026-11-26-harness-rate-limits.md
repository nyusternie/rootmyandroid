<!-- docs/HANDOFF-2026-11-26-harness-rate-limits.md -->

# HANDOFF — Harness heartbeat rate limits

**To:** API team (`rootmyandroid-api`)
**From:** web + Android workstream (`rootmyandroid`)
**Date:** 2026-11-26
**Status:** APPLIED — API commit `8172e88`, CI `45898642676`; reply
`rootmyandroid-api/docs/HANDOFF-REPLY-2026-11-26-harness-rate-limits.md`;
review `docs/HANDOFF-ACK-2026-11-26-harness-rate-limits.md`. The two
constants are 300/h; the list limits are unchanged.

Per `AGENTS.md` rule 9 this document is the write channel into
`rootmyandroid-api`. The API team applied the original request in `f209b18`;
this is a follow-up, not a re-litigation of the design.

---

## 1. Context

The API reply (`rootmyandroid-api/docs/HANDOFF-REPLY-2026-11-26-harness-api.md`)
shipped:

| scope | shipped limit | source |
| --- | --- | --- |
| `harness_list_ip` | 20/h/IP | `src/lib/harness.js` |
| `harness_list_account` | 30/h/account | `src/lib/harness.js` |
| `harness_heartbeat_ip` | 60/h/IP | `src/lib/harness.js` |
| `harness_heartbeat_account` | 240/h/account | `src/lib/harness.js` |

The list limits are fine: the page's **Sync agents** is click-driven. The
heartbeat limits are the issue.

**Target deployment (this request):** up to **five Rootz harness devices per
account**, each at the tool's **60 s default**; one device at the **15 s
floor** also fits. This is the profile the limits protect. The
one-harness-per-IP profile is not the target.

---

## 2. The arithmetic

The heartbeat tool (`apps/rootzd/tools/harness-heartbeat.mjs`) defaults to
`--interval 60` and documents a floor of 15 s. An account links up to five
devices (`AGENTS.md`). Writes per hour:

| cadence | writes/h | `harness_heartbeat_ip` 60/h | `harness_heartbeat_account` 240/h |
| --- | --- | --- | --- |
| one device, 60 s (default) | 60 | exactly at the limit | fits |
| one device, 15 s (floor) | 240 | **4× over** | exactly at the limit |
| two devices, 60 s, one IP | 120 | **2× over** | fits |
| five devices, 60 s, one IP/account | 300 | **5× over** | **over by 60/h** |

The reply's §0 says *“Heartbeats are sized so `--watch` at its documented
floor still fits.”* That holds for the account limit at one device, and does
not hold for the IP limit at the floor or for multiple devices on one IP.

The tool now honors `retry_after` and backs off, so the current limits are
survivable. They still throttle the documented floor and the five-device
account ceiling.

---

## 3. Requested change

Raise **both** heartbeat limits:

```js
// rootmyandroid-api/src/lib/harness.js
export const HARNESS_HEARTBEAT_MAX_PER_IP_PER_HOUR = 300
export const HARNESS_HEARTBEAT_MAX_PER_ACCOUNT_PER_HOUR = 300
```

Keep the two list limits unchanged (20/h/IP, 30/h/account). The ACK's
240/240 option is withdrawn: it covered one harness per IP, which is not the
target deployment.

Why 300:

- one device at 15 s = 240/h → fits with 60/h headroom;
- one device at 12 s = 300/h → fits;
- five devices at 60 s = 300/h → fits;
- five devices at 15 s = 1,200/h → still over, but that is not a default and
  not a cadence the tool recommends.

The tool's startup warning for `--interval < 60` is in this repo
(`apps/rootzd/tools/harness-heartbeat.mjs`), not the API repo. We own that
edit and are making the string limit-agnostic in the same change window; the
API team owns only the two constants above.

---

## 4. Verification

- The API test suite can pin the two exported constants at 300 and assert a
  301st write in the window returns `429 rate_limited` with `retry_after`.
- Production check with a throwaway account:
  - one device, `--watch --interval 15` for an hour → no 429;
  - five devices, `--watch --interval 60` → no 429;
  - the 301st write in the window → 429 with `retry_after`.
- The page's reads are unaffected; the list limits stay at 20/30.

---

## 5. Not chosen

The one-harness-per-IP profile (keep 60/h/IP and 240/h/account) is not the
target. It covers one device at 60 s and throttles the 15 s floor and every
multi-device account. The tool's `retry_after` backoff makes that profile
survivable, but it does not meet the documented five-device ceiling.

The web/Android side does not need a coordinated release for the tool
warning; that string lives in this repo and is limit-agnostic.

---

## 6. Resolution

Applied 2026-11-26 in `rootmyandroid-api` commit `8172e88` (CI
`45898642676`): both heartbeat caps are 300/h; the list caps are unchanged.
The reply records a 61/61 live burst and the 429 tests. The review is
`docs/HANDOFF-ACK-2026-11-26-harness-rate-limits.md`; the only open item is
the product decision on the five-device relay cap, not the rate limit.
