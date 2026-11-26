<!-- docs/HANDOFF-2026-11-26-guru-unit.md -->

# Handoff — GURU is the unit of measure; HALO is retired

- Written 2026-11-26 from `rootmyandroid` (the public repo).
- Owner ruling, 2026-11-26, verbatim: **"let's use `GURU` as our unit of
  measure"** and **"make sure `HALO` is retired 100%"**.
- Audience: `rootmyandroid-api` (acts first — it is the only repo where the
  unit is still alive), `rootmyandroid-admin`, `rootmyandroid-relay`, and the
  web workstream in this repo.
- Channel: this repo's AGENTS.md rule 9 makes every sibling repo READ-ONLY
  for this workstream. **Nothing below has been applied to a sibling repo.**
  Each team applies its own section; this file is the request.

---

## 1. The ruling, and what it does not decide

**1 GURU = USD 0.01, fixed peg; 100 GURU = $1** (owner ruling 2026-11-26:
*"treat GURU as a stablecoin, pegged to USD — 1 GURU == $0.01 — which can be
used for inference ONLY"*). An account's wallet is its **GURU balance** —
`guruBalance` on the wire, `guru_balance` in D1. The display name is "GURU
balance" (unit in caps, like USD), which supersedes the 2026-11-08 display
string "Guru Balance".

**GURU is inference only.** It never buys subscription time and never
converts to plan days.

**The peg is publishable; the word "stablecoin" is not** — see §7.1.

**Subscriptions are NOT denominated in GURU.** They are time (days) at dollar
prices — Guardian Angel Lite $5/30d, Pro $15/30d, Rootz Pro $15/365d. This is
deliberate: Halo died because one unit tried to cover both time and
consumption (`rootmyandroid-api/src/lib/halo.js:1-4` — *"1 Halo = 30 days
Basic, 2 Halos = Advanced, 3 Halos = Pro"*). When the plan lineup changed, the
unit stopped meaning anything. Do not repeat that: **days for plans, GURU for
inference, never one unit for both.**

**Still undecided — do not invent:**

1. **The ledger's smallest unit — answered by the existing pricing record.**
   `rootmyandroid-api/docs/ai-pricing.md:17` charges in integer nano-USD and
   its examples are 525,000 nUSD ($0.000525) and 15,525,000 nUSD
   ($0.015525). Since 1 GURU = $0.01 = 10,000,000 nUSD, **1 nano-GURU ==
   1 nano-USD** and no rescaling is needed. A whole-GURU column is five
   orders too coarse (the cheap turn is 0.0525 GURU) — store nano-GURU.
2. **Redeemability.** A peg is a conversion rate, not a buy-back promise.
   `/gurus:212` says top-ups are non-refundable and `/terms:51` says the
   balance is not redeemable for cash — so the word "stablecoin" cannot go
   on the site until the Terms change. See §7.1.

---

## 2. Where HALO still lives (verified 2026-11-26)

### `rootmyandroid-api` — the whole problem

| file | refs | what |
|---|---|---|
| `src/lib/halo.js` | 32 | the unit itself: `HALO_PACKS` (:15-19), `HALO_SERVICE_PRICES` (:26+), `consumeHalo`, doc header (:1-4) |
| `src/index.js` | 37 | routes + handlers + route list (:1470-1472) |
| `src/schema.js` | 11 | `accounts.halo_balance` (:15), `halo_ledger` (:110 comment), rename precedent (:245, :260, :268) |
| `src/lib/redeem.js` | 9 | vouchers credit Halo |
| `scripts/make-codes.js` | 5 | `--halo` flag, `halo_amount` in the INSERT |
| `src/lib/analytics.js` | 2 | event names |
| `src/lib/ledger.js` | 1 | ledger unit |

Live routes: `POST /v1/halo` (:880), `GET /v1/halo/services` (:896),
`POST /v1/halo/consume` (:912), plus `/v1/billing/halo/checkout` and
`/v1/billing/halo/payment`.

Consumption is **FROZEN** (`src/lib/halo.js:22-25`, owner ruling 2026-11-04):
nothing is charged today, so this is a rename with no live money on it.

### `rootmyandroid-admin`

- `src/lib/analytics.js:320` `halo_consumed: 0`, `:566` event list,
  `:1050` funnel field.
- `public/app.js:978-979` — the dashboard card titled **"Halo & vouchers"**.
- `docs/session-notes/roadmap-2026-11-10.md:394-395` already recorded this
  exact gap: *"POST /v1/accounts still emits `halo_balance` (wire-compat?
  Halo retired repo-side 2026-11-08) — possible handoff doc for the API team,
  low priority."* This file resolves that note.

### `rootmyandroid-relay`

**No action.** Recorded in this repo's `apps/rootzd/docs/relay-api-todo-2026-11-07.md:33`
("Halo metering — NO ACTION"), `relay-api-reply-2026-11-09.md:137`, and
`relay-handoff.md:36` — the relay is free, abuse control is rate caps.

### `rootmyandroid` (this repo) — done

Zero live billing-unit references. What remains is **not** the unit:

- the Guardian Angel's **golden halo** — `dl-halo` (`global.css:686`,
  `Download.astro:133`), `guardian_notif.xml`, the lottie layer named `halo`
  (`assets/guardian-pulse.json`), `App.tsx:25` backdrop, and the alt text
  ("a green Android robot with a golden halo") in `i18n/en/{home,guardian,
  download,pricing}.ts` and `parents.astro`;
- history: `HANDOFF.md`, `docs/`, and the removal note at
  `apps/web/src/pages/account.astro:5-6`.

**Do not rename or delete any of those.** The halo is the character; the unit
was a billing abstraction that borrowed its name. Deleting the artwork to
satisfy "retire Halo 100%" would be a regression.

---

## 3. Naming map

| old | new |
|---|---|
| Halo (unit) | **GURU** |
| `halo_balance` | `guru_balance` |
| `halo_ledger` / `halo_amount` | `guru_ledger` / `guru_amount` |
| `HALO_PACKS` / `HALO_SERVICE_PRICES` | `GURU_PACKS` / `GURU_SERVICE_PRICES` |
| `consumeHalo()` | `consumeGuru()` |
| `src/lib/halo.js` | `src/lib/guru.js` |
| `POST/GET /v1/halo*` | `/v1/guru*` |
| `/v1/billing/halo/checkout`, `/payment` | `/v1/billing/guru/checkout`, `/payment` |
| `--halo N` (`make-codes.js`) | `--guru N` |
| `halo_consumed` (analytics) | `guru_consumed` |
| "Guru Balance" (display) | "GURU balance" |

---

## 3.5 The AI ledger is greenfield — build it in GURU from row one

`docs/ai-pricing.md` in the API repo defines the inference accounting
(`ai_sessions` / `ai_requests` / `ai_ledger_entries` / `model_price_versions`)
as a **future** handoff, and `grep -rli guru` over `rootmyandroid-api` returns
that document and nothing else. Meanwhile `apps/web/src/lib/api.js:196,207`
already calls `POST /v1/support/conversations/{id}/guru` and `…/guru/quote`,
which the API does not implement (only `POST /conversations` and the two
`/messages` routes exist, `src/index.js:1503`).

So there is nothing to migrate on the AI side — there is something to build.
When it lands, the unit is nano-GURU and the peg makes it equal to nano-USD.

---

## 4. API migration — follow the precedent already in the file

`schema.js` has done this twice already: `nitro_*` → `halo_*`. Use the same
shape, third time:

```js
// schema.js:245, :260, :268 — the existing pattern
ALTER TABLE accounts     RENAME COLUMN nitro_balance TO halo_balance
ALTER TABLE nitro_ledger RENAME TO halo_ledger
ALTER TABLE redeem_codes RENAME COLUMN nitro_amount TO halo_amount
```

Steps:

1. `src/lib/halo.js` → `src/lib/guru.js`; rename exports; keep every comment
   and the CONSUMPTION FROZEN note verbatim (rule 2 — no logic dropped).
2. `schema.js`: add guarded `RENAME COLUMN halo_balance → guru_balance` and
   `RENAME COLUMN halo_amount → guru_amount`, `RENAME TABLE halo_ledger →
   guru_ledger`, plus `DROP INDEX IF EXISTS idx_halo_ledger_account` — the
   file already normalizes the carried-over index name after a table rename
   (:258-263), so mirror that.
3. `src/index.js`: rename the three `/v1/halo*` routes and the two billing
   routes; update the route list (:1470-1472).
4. `src/lib/redeem.js`, `src/lib/ledger.js`, `src/lib/analytics.js`,
   `scripts/make-codes.js` — mechanical rename, keep behaviour identical.
5. `POST /v1/accounts` must emit `guru_balance`. **This breaks the wire** —
   and it is safe: no client in `rootmyandroid` reads `halo_balance`
   (verified: the only `halo` hits in `apps/web/src` are artwork and a
   comment). Still, say so in the API changelog.
6. `make-codes.js`: `--halo` → `--guru`, and fix the header, which still
   describes the retired lineup ("1/2/3 Halo redeem for 30 days of
   Basic/Advanced/Pro", `scripts/make-codes.js:7`).

**Do not** delete the redeem rail while renaming. It is the only working
money-in path today (see §6).

---

## 5. What the marketplace needs from the API (beyond the rename)

The reseller program is live as a page (`/marketplace`) and its tiers are
published, but the rail cannot express a vendor sale. Today
`redeem_codes` carries `code_hash`, `halo_amount`, `batch` (free text),
`redeemed_by`, `redeemed_at` — and nothing else (`schema.js:137-152`).

Needed before a real vendor order can be honoured:

1. `guru_amount` (after §4) **or** `plan_days` — a voucher must state which
   kind it is, since plans are time and inference is GURU.
2. `vendor_id` and `order_id` — without them the buy-back of unsold inventory
   cannot be attributed to a vendor or billed to an order. `batch` is a
   free-form string and is not a substitute.
3. A **void/return** path for unredeemed codes (`redeemed_at IS NULL`), so
   the published buy-back is executable rather than aspirational.
4. Bulk issuance — currently codes are minted offline by
   `scripts/make-codes.js` and loaded with `wrangler d1 execute`. A vendor
   cannot be served by a laptop.

---

## 6. Current money rails, for context

- **Vouchers are the only wired money-in path**: `POST /v1/redeem` →
  `redeemCode()` → credits the wallet (`src/index.js:965-1009`).
- The web has **no** call to `/v1/billing/*`: `createCheckout()` /
  `createCryptoCheckout()` exist in `apps/web/src/lib/api.js` and are never
  invoked; `/account` says *"Checkout on this page returns soon."*
- The 15% crypto discount is documented in `AGENTS.md` and
  `i18n/en/pricing.ts:5-6` but **enforced nowhere** (`grep -rniE
  "0\.85|15%|discount" src/` in the API returns one comment).

---

## 7. Open questions this handoff cannot answer

1. The ledger's smallest unit — GURU or milli-GURU (§1).
2. Whether subscription vouchers are denominated in **days** (recommended,
   consistent with §1) or in a dollar amount that buys days.
3. Whether the buy-back covers unredeemed **GURU** vouchers as well as
   subscription vouchers. `redeemed_at` makes it checkable; `vendor_id`
   (§5) makes it billable. The peg makes the amount exact: 100 GURU = $1.

### 7.1 Why the word "stablecoin" is not on the site

The owner's framing is "a stablecoin pegged to USD". Two live documents
contradict the label, not the peg:

- `apps/web/src/pages/gurus.astro:212` — *"Guru Balance top-ups are
  **non-refundable** — stated plainly before you pay."*
- `apps/web/src/pages/terms.astro:51` — the balance *"is not redeemable,
  exchangeable, or refundable for cash or cryptocurrency"*.

A stablecoin is redeemable at par by construction. A balance that is pegged
but non-redeemable is **prepaid credit at a fixed rate** — which is a
defensible product, and is what the pages currently describe. Publishing
"stablecoin" would promise a cash-out the Terms refuse, and invite the
money-transmission framing that comes with issuing a redeemable pegged
asset.

So: publish the peg (`1 GURU = $0.01`), keep the label off the site, and if
the owner wants the label, change `/gurus` + `/terms` first. That is an
owner/legal call, not an agent's.

---

## 8. Verification recipe

```sh
# API: no billing-unit Halo left
grep -rniE "halo" rootmyandroid-api/src rootmyandroid-api/scripts   # expect: 0

# admin: no halo metric left
grep -rniE "halo" rootmyandroid-admin/src rootmyandroid-admin/public # expect: 0

# this repo: only the character's halo remains
grep -rniI "halo" rootmyandroid/apps/web/src                          # expect: artwork + 1 comment
grep -rniI "halo" rootmyandroid/apps/guardian-angel                   # expect: artwork only
```

`grep` in this repo must NOT be made to return zero by editing the artwork —
see §2.
