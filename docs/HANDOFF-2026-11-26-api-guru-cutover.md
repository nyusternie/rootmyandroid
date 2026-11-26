<!-- docs/HANDOFF-2026-11-26-api-guru-cutover.md -->

# Handoff — `rootmyandroid-api`: Halo → GURU cutover

**From:** web workstream in `rootmyandroid` (the public repo)
**For:** `rootmyandroid-api` (REST worker + GraphQL worker + scripts)
**Status:** PROPOSED — nothing has been applied. This is a request, not a change.
**Ruling:** owner, 2026-11-26 — *"let's use `GURU` as our unit of measure"*,
*"make sure `HALO` is retired 100%"*.
**Companion:** `docs/HANDOFF-2026-11-26-guru-unit.md` in this repo is the
cross-team summary (web / admin / relay). **This file is the detailed API
version and supersedes it for anything inside `rootmyandroid-api`.**
**Baseline:** API `master` at `3ff9c35`, read 2026-11-26.

---

## 1. Why this lands on you

The web side is already done: the public site has **zero** references to the
billing unit (the only `halo` strings left in `apps/web/src` are the Guardian
Angel's golden halo artwork, plus one comment recording the 2026-11-08
removal). `rootmyandroid-api` is the last place the unit is alive — and it is
alive everywhere: REST, GraphQL, D1 schema, the code generator, analytics, and
13 test suites.

There is one thing that makes this cheap, and it is the whole reason to do it
now: **no client reads the unit.** Verified 2026-11-26 across
`apps/` and `packages/` in this repo:

```sh
grep -rniI "halo_balance|/v1/halo|haloBalance|haloServices|priceHalo" apps packages
# → no matches
```

The web stopped displaying a balance on 2026-11-08, `apps/web/src/lib/api.js`
never calls `/v1/halo*`, and nothing here speaks GraphQL. Unlike the
nitro→halo cutover (`HANDOFF-2026-11-03-halo-rebrand.md` §5), which had to
sequence an iOS release first, **this cutover has no client to coordinate.**

---

## 2. The ruling, and the two things it does not decide

**1 GURU = one unit of AI-inference credit.** The wallet is the **GURU
balance** (`guruBalance` on the wire, `guru_balance` in D1), displayed
"GURU balance" — caps, like USD.

**Subscriptions are not denominated in GURU.** They are time (days) at dollar
prices. Halo died because one unit covered both time and consumption
(`src/lib/halo.js:1-4`: *"1 Halo = 30 days Basic, 2 Halos = Advanced, 3 Halos
= Pro"*). Do not let the rename re-create that.

**Not decided — do not invent:**

1. **The face value of 1 GURU** (GURU per USD). `AGENTS.md` in this repo
   requires a published per-request price before each request, so no GURU
   price may appear in any surface until the owner rules it. **The safe
   migration renames the unit and leaves every amount exactly as it is.**
2. **Whether the pack ladder stays a credit ladder.** `HALO_PACKS`
   (`src/lib/halo.js:15-17`) still encodes the retired `$5 = 1 Halo`
   economics, which no longer matches the published plan table on `/pricing`.
   Renaming `halo_*` → `guru_*` preserves that mismatch; fixing it is a
   separate, owner-gated decision. Do not fix it inside the rename.

---

## 3. Inventory (verified at `3ff9c35`)

### 3.1 Source

| file | refs | what |
|---|---|---|
| `src/index.js` | 79 | 3 REST routes + 2 billing routes + handlers + route list + `halo_balance` in 7 response payloads |
| `src/lib/halo.js` | 55 | the unit: `HALO_PACKS` (:15-17), `HALO_SERVICE_PRICES` (:26+), `getHaloBalance`, `consumeHalo`, doc header (:1-4) |
| `src/schema.js` | 16 | `accounts.halo_balance` (:15), `halo_ledger` (:112), `idx_halo_ledger_account` (:129), rename precedent (:245, :259, :268) |
| `src/lib/redeem.js` | 11 | vouchers credit the unit |
| `scripts/make-codes.js` | 9 | `--halo` flag + `halo_amount` in the INSERT |
| `src/lib/analytics.js` | 2 | event name |
| `src/lib/ledger.js` | 1 | ledger doc |
| `src/lib/relay.js` | 1 | comment only — *"there is deliberately no Halo gate here"* (:14). No code. |

### 3.2 GraphQL worker (inside this repo — do not miss it)

`workers/rootmyandroid-graphql/src/schema.js` — 52 refs, a **public** type
surface:

```
haloBalance            (field, :218, :261)
HaloBalance            (:255)
HaloService / haloServices  (:230, :237 priceHalo)
HaloCheckout / HaloCryptoCheckout  (:302-303, :322-323 pack + halo fields)
pack ids halo_1 | halo_4 | halo_6  (:302, :322)
```

`workers/rootmyandroid-graphql/test/graphql.test.js` — 35 refs.

### 3.3 REST surface (as deployed)

| route | handler |
|---|---|
| `POST /v1/halo` — balance + recent ledger | `src/index.js:880` |
| `GET /v1/halo/services` — PRO catalog + prices | `:896` |
| `POST /v1/halo/consume` — charge a PRO service | `:912` |
| `POST /v1/billing/halo/checkout` | card rail |
| `POST /v1/billing/halo/payment` | whitelabel deposit rail |

Route index listing: `:1470-1472`.

**Response fields carrying the unit:** `halo_balance` at `:108`, `:126`,
`:204`, `:239`, `:304`, `:530`, `:625`, `:887`; `halo` (numeric credit) in
checkout responses; `price_halo` in the services catalog.

### 3.4 Data

| object | today |
|---|---|
| `accounts.halo_balance` | `schema.js:15` |
| `halo_ledger` table | `:112` |
| `idx_halo_ledger_account` | `:129` |
| `redeem_codes.halo_amount` | `:142` (and the `nitro_amount` rename at `:268`) |
| `events.name = 'halo_consumed'` | historical rows in D1 |

### 3.5 Tests

`test/halo.test.js` (100), `test/schema.test.js` (20), `test/redeem.test.js`
(13), `test/audit.test.js` (13), `test/guardian.test.js` (12),
`test/backups.test.js` (12), `test/checkout.test.js` (8), `test/setup.js` (1),
`workers/rootmyandroid-graphql/test/graphql.test.js` (35).

### 3.6 Docs inside the API repo

`README.md` (:23, :25, :28, :29, :81), `ANALYTICS.md` (:59).
`HANDOFF-2026-11-03-halo-rebrand.md` is **history — leave it alone** (same rule
this repo applies to its own historical handoffs).

---

## 4. Cutover strategy — reuse your own precedent

`HANDOFF-2026-11-03-halo-rebrand.md` settled this pattern for nitro→halo, and
the owner rulings it records still hold:

- **D3 (owner, 2026-11-03): HARD CUTOVER — no aliases, nothing kept
  indefinitely.** Old paths return the router's standard `not_found`.
- **D5: schema and analytics history are renamed in place**, not
  dual-written.
- **§5.8: tests renamed to match; CI green required before deploy.**

Apply the same shape a third time. The one difference: **there is no
sequencing constraint** — no shipped client reads the unit, so the deploy is
self-contained and needs no cutover window with the web team.

### 4.1 Exact migration SQL (mirror `schema.js:240-270`)

The file already does this twice (`nitro_*` → `halo_*`). Guarded, idempotent,
data preserved:

```js
// accounts
ALTER TABLE accounts RENAME COLUMN halo_balance TO guru_balance
// ledger table + its carried-over index name
ALTER TABLE halo_ledger RENAME TO guru_ledger
DROP INDEX IF EXISTS idx_halo_ledger_account
// vouchers
ALTER TABLE redeem_codes RENAME COLUMN halo_amount TO guru_amount
// analytics history, in place (D5 precedent)
UPDATE events SET name = 'guru_consumed' WHERE name = 'halo_consumed'
```

`RENAME COLUMN` / `RENAME TABLE` are two-way — the rollback target is the
prior commit plus the reverse statements.

### 4.2 Rename map

| old | new |
|---|---|
| `Halo` (unit) | **GURU** |
| `halo_balance` | `guru_balance` |
| `halo_ledger` / `idx_halo_ledger_account` | `guru_ledger` / `idx_guru_ledger_account` |
| `redeem_codes.halo_amount` | `redeem_codes.guru_amount` |
| `HALO_PACKS` / `HALO_SERVICE_PRICES` | `GURU_PACKS` / `GURU_SERVICE_PRICES` |
| `halo_1` / `halo_4` / `halo_6` | `guru_1` / `guru_4` / `guru_6` (amounts unchanged — §2.2) |
| `getHaloBalance` / `consumeHalo` | `getGuruBalance` / `consumeGuru` |
| `src/lib/halo.js` | `src/lib/guru.js` |
| `POST /v1/halo`, `GET /v1/halo/services`, `POST /v1/halo/consume` | `/v1/guru`, `/v1/guru/services`, `/v1/guru/consume` |
| `/v1/billing/halo/checkout`, `/v1/billing/halo/payment` | `/v1/billing/guru/checkout`, `/v1/billing/guru/payment` |
| `price_halo` | `price_guru` |
| `halo` (numeric credit in checkout payloads) | `guru` |
| GraphQL `haloBalance`, `HaloBalance`, `halo`, `priceHalo`, `HaloService`, `haloServices`, `HaloCheckout`, `HaloCryptoCheckout` | `guruBalance`, `GuruBalance`, `guru`, `priceGuru`, `GuruService`, `guruServices`, `GuruCheckout`, `GuruCryptoCheckout` |
| `halo_consumed` (event) | `guru_consumed` |
| `--halo N` (`make-codes.js`) | `--guru N` |
| invoice/order descriptions ("… 100 Halo — <acct>") | GURU wording |

### 4.3 Two things to fix while you are in there

1. `scripts/make-codes.js:7` still documents the retired lineup: *"1/2/3
   Halo redeem for 30 days of Basic/Advanced/Pro once plans ship."* Those
   plans no longer exist (Lite / Pro / Rootz Pro are the published table).
   Correct the comment; do not invent the mapping.
2. `src/lib/halo.js:22-25` — the CONSUMPTION FROZEN note (owner ruling
   2026-11-04) must survive the rename **verbatim**. It is the reason nothing
   is charged today, and dropping it would look like a live pricing change.

---

## 5. What the marketplace needs from you (beyond the rename)

`/marketplace` is live and its tiers are published, but the voucher rail
cannot express a vendor sale. Today `redeem_codes` is
`code_hash | halo_amount | batch | redeemed_by | redeemed_at | created_at`
(`src/schema.js:137-152`; `halo_amount` at `:142`) — `batch` is a free-form string, not a vendor.

Before a real vendor order can be honoured:

1. **`plan_days` or `guru_amount`** — a voucher must say which kind it is,
   because plans are time and inference is GURU. One `amount` column cannot
   serve both without repeating the Halo mistake.
2. **`vendor_id` and `order_id`** — required for the buy-back that is already
   published on `/marketplace` ("unsold and unspent vouchers can be returned
   to us"). Without them, a return cannot be attributed or billed.
3. **A void path** for unredeemed codes (`redeemed_at IS NULL`), so the
   published buy-back is executable rather than aspirational.
4. **Bulk issuance** — codes are currently minted by a CLI and loaded with
   `wrangler d1 execute` (`scripts/make-codes.js`). A vendor cannot be served
   by a laptop.

None of this blocks the rename; the rename should land first and alone.

---

## 6. Open questions for you

| # | Question | Recommendation |
|---|---|---|
| Q1 | Pack ids: `guru_1/4/6` (rename) or new ids matched to the published plans? | **Rename only** — new ids are a product decision, and the face value is unruled (§2.1) |
| Q2 | Does `POST /v1/guru/consume` stay frozen after the rename? | **Yes** — carry the 2026-11-04 ruling forward verbatim |
| Q3 | Wire break on `POST /v1/accounts`: emit `guru_balance` only, or both for a release? | **Only** — D3 says no aliases, and there is no consumer to break |
| Q4 | GraphQL: rename the types (breaking schema) or add aliases? | **Rename** — same ruling; nothing in this repo queries GraphQL |
| Q5 | Historical `halo_consumed` rows: rename in place, or keep and label? | **Rename in place** — the D5 precedent, so dashboards stay continuous |
| Q6 | `admin` consumes `halo_consumed` (`rootmyandroid-admin/src/lib/analytics.js:320`, `:566`, `:1050`, and the "Halo & vouchers" card at `public/app.js:978-979`) | Coordinate: their deploy must follow yours, or the card reads zero. Their side is in the companion handoff. |

---

## 7. Acceptance criteria

```sh
# 1. no billing-unit Halo left in source, scripts, workers
grep -rniE "halo" src scripts workers   # expect: 0 (relay.js:14 comment included)

# 2. tests green, renamed
pnpm test                               # expect: all suites pass

# 3. schema migrated, data intact
#    accounts.guru_balance, guru_ledger, redeem_codes.guru_amount exist;
#    row counts unchanged vs pre-migration snapshot

# 4. REST answers on the new paths only
curl -s -X POST https://api.rootmyandroid.com/v1/halo        # expect: not_found
curl -s -X POST https://api.rootmyandroid.com/v1/guru -d …   # expect: balance + recent

# 5. docs
grep -rniE "halo" README.md ANALYTICS.md  # expect: 0
#    HANDOFF-2026-11-03-halo-rebrand.md is history — expected to still match
```

Definition of done: `grep` returns zero in source/scripts/workers/tests/docs
(history excepted), CI green, migration idempotent on a second run, and the
rename is the **only** behavioural change in the commit.

---

## 8. What the web side did, and what it will do after

Done (this repo, `fefb6c4`): `AGENTS.md` records the GURU ruling;
`/marketplace` denominates inference vouchers in GURU; the cross-team handoff
exists. The web displays no balance and calls no unit endpoint, so **the
cutover needs nothing from us at deploy time.**

After your deploy lands, the web side can pick up — only on owner instruction:
the "GURU balance" display pass on `/gurus` (`gurus.astro:64,205,212`) and the
support widget (`support.ts:315`), which still read "Guru Balance".

---

## 9. Boundary

Per this repo's AGENTS.md rule 9, `rootmyandroid-api` is READ-ONLY for this
workstream: everything above was read (`src/`, `workers/`, `scripts/`,
`test/`, docs), and **nothing was written, committed, deployed or migrated.**
Ownership of the cutover, its sequencing and its rollback stays with your team.
