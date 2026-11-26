<!-- docs/HANDOFF-2026-11-26-api-guru-repeg.md -->

# Handoff — `rootmyandroid-api`: GURU re-peg to $1.00 with 6 decimals

**From:** web workstream in `rootmyandroid` (the public repo)
**For:** `rootmyandroid-api` (REST worker + GraphQL worker + scripts)
**Status:** SHIPPED — implemented by the API team as `9bc6e0a` (test fix
`2eda473`, verification `cf3dde7`, CI `45877148312`). This document keeps the
request, the six review gates, and the corrections the implementation forced
on it (§12.5).
**Rulings:** owner, 2026-11-26 —
*"perhaps 1 GURU should equal $1.00 instead… and then give it 6-decimal places"*,
*"use STRING for GURU balances in GraphQL"*,
*"sub-micro charges should round up"*,
wire format = integer µGURU, display = up to 6 decimals with trailing zeros trimmed.
**Supersedes:** the $0.01 peg in `HANDOFF-2026-11-26-api-guru-cutover.md`
(that cutover shipped as `4876c62`; the peg it records is superseded the same day).
**Baseline:** API `master` at `4876c62`, read 2026-11-26.

---

## 1. The ruling

**1 GURU = USD 1.00, 6 decimals → 1 GURU = 1,000,000 µGURU.**

One stored unit is exactly **one micro-dollar**. That identity is the point:
the ledger's integer and µUSD are the same number, so no scaling factor exists
between "what we bill" and "what we store".

**Balances are integer µGURU, carried as a String.** µGURU is the only
representation — never a float, never a display string with implied precision.

**Charges round UP to the whole µGURU:** `micro = ceil(nano / 1000)`.
1 µGURU = 1000 nUSD, so `ai-pricing.md`'s worked examples convert exactly:
525,000 nUSD → **525 µGURU**; 15,525,000 nUSD → **15,525 µGURU**.

---

## 2. Why now, and not after the AI ledger

Nothing is selling GURU today: consumption is frozen (owner ruling
2026-11-04), the AI billing backend does not exist, and there are no vendor
records. The only GURU amounts in production are test data and any codes
minted by hand.

After `ai_ledger_entries` is built, this same flip becomes a migration with
real charges in it. The cost only rises.

---

## 3. Current state (verified at `4876c62`)

| object | today | note |
|---|---|---|
| `accounts.guru_balance` | `INTEGER`, whole GURU at $0.01 | `src/schema.js:15` |
| `guru_ledger.delta` / `.balance_after` | `INTEGER`, whole GURU | `src/schema.js:112-125` |
| `redeem_codes.guru_amount` | `INTEGER`, whole GURU | `src/schema.js:142` |
| packs | `guru_500/2000/3000` = $5/$20/$30 | `src/lib/guru.js:14-18` |
| GraphQL | `GraphQLInt` for `guruBalance`, `delta`, `balanceAfter`, `guru`, `priceGuru` | `workers/rootmyandroid-graphql/src/schema.js:218,246,247,261,303,323` |

The value chain already applied: `nitro_* → halo_*` (rename), then
`halo_* → guru_*` at **×500** (1 Halo was $5, 1 GURU was $0.01). This handoff
adds the third and last step.

---

## 4. The conversion

```
µGURU = current_guru_balance × 10,000
```

Derivation: the current unit is worth $0.01; the new unit is worth
$0.000001 — a factor of 10,000. Worked: 500 GURU (=$5 today) →
**5,000,000 µGURU** (= $5 tomorrow). Value is preserved exactly; only the
scale changes.

Apply the same factor to:

- `accounts.guru_balance`
- `guru_ledger.delta` and `guru_ledger.balance_after` (signed: multiply the
  value, keep the sign)
- `redeem_codes.guru_amount`

**One-shot guard required.** The column name does not change, so the
rename-based guard used twice before does not apply. Either:

- add a `schema_meta(key TEXT PRIMARY KEY, value TEXT)` row
  `('guru_scale','micro')` and run the multiply only when it is absent; or
- rename `guru_balance → guru_balance_halo_scale`, add the new column, copy
  `× 10000`, drop the old one — the rename itself is the guard.

Either way the migration must be idempotent: a second `ensureSchema` run
must be a no-op, and a failed run must not leave a half-scaled table.

---

## 5. Packs

`guru_500 / guru_2000 / guru_3000` encode amounts, so the ids must change:

| old id | new id | price | credits |
|---|---|---|---|
| `guru_500` | `guru_5` | $5 | 5 GURU = 5,000,000 µGURU |
| `guru_2000` | `guru_20` | $20 | 20 GURU = 20,000,000 µGURU |
| `guru_3000` | `guru_30` | $30 | 30 GURU = 30,000,000 µGURU |

Dollar prices are unchanged (owner ruling 2026-11-04 on the ladder). Carry the
credit amount as µGURU in the pack record so nothing downstream multiplies by
a float.

---

## 6. Wire format

Balances and amounts travel as **decimal strings of integer µGURU**:

```json
{ "ok": true, "guru_balance": "5000000" }
```

- Same representation in REST and GraphQL — one value, one meaning.
- GraphQL types these fields **`String`** (owner ruling 2026-11-26). `Int`
  caps at 2,147,483,647 µGURU = **$2,147.48**, which a reseller batch
  exceeds; this is not a hypothetical limit.
- `price_guru` (the frozen service catalog) follows the same rule.
- `days` stays `Int` — subscription time is not GURU.

**Display.** Clients must not do float math. Two acceptable shapes; pick one
and document it:

1. **Recommended** — the API returns the µGURU integer string and the client
   formats it by inserting a decimal point six digits from the right and
   trimming trailing zeros (`"5000000"` → `5 GURU`, `"525"` → `0.000525
   GURU`). String surgery, never `Number()`.
2. The API also returns a preformatted display string alongside the integer
   (`guru_balance_micro: "5000000"`, `guru_balance: "5.000000"`), which keeps
   the existing "render verbatim, never parse" contract in
   `apps/web/src/scripts/support.ts` intact.

The web support widget currently renders `chargeUsd` / `balanceUsd` verbatim
from the Guru endpoints; those endpoints are not implemented, so nothing on
the web breaks either way.

---

## 7. Rounding

Document in `docs/ai-pricing.md` next to ruling 3:

```
charge_micro = ceil(charge_nusd / 1000)
```

Rounding up extends the 2026-11-08 "never silently under-recover" rule to the
new scale. A sub-µGURU remainder is always charged, never dropped.

---

## 8. Tests to update

`test/guru.test.js`, `test/schema.test.js` (the migration is asserted there),
`test/redeem.test.js`, `test/checkout.test.js`, and the funding helpers in
`test/backups.test.js`, `test/audit.test.js`, `test/guardian.test.js` — every
`UPDATE accounts SET guru_balance = ?` now carries µGURU. GraphQL:
`workers/rootmyandroid-graphql/test/graphql.test.js` for the `String` types.

---

## 9. Acceptance

```sh
# 1. no whole-GURU scale left
#    EXCEPTION: LEGACY_PACKS (src/index.js:82-86) is the one place the old ids
#    may remain — settlement must accept invoices created before the rename.
grep -rn "guru_500\|guru_2000\|guru_3000" src workers scripts

# 2. a $5 purchase credits exactly 5,000,000
#    (pack guru_5 settled → guru_balance "5000000")

# 3. migration is idempotent: run ensureSchema twice, balance unchanged

# 4. GraphQL types
#    { guruBalance { guruBalance } } → String, e.g. "5000000"

# 5. rounding
#    a 525,000 nUSD charge debits exactly 525 µGURU

# 9. production data is really on the new scale (read-only; the one check that
#    cannot be done from a test suite)
#    SELECT COUNT(*), SUM(guru_balance) FROM accounts WHERE guru_balance > 0;
#    SELECT COUNT(*), SUM(guru_amount)  FROM redeem_codes WHERE redeemed_at IS NULL;
#    SELECT COUNT(*) FROM payments
#     WHERE raw_ipn LIKE '%guru_500%' OR raw_ipn LIKE '%guru_2000%'
#        OR raw_ipn LIKE '%guru_3000%';

# 10. test values are µGURU now, not dollars
#     test/redeem.test.js inserts 100/75/350 and the funding helpers use 100;
#     after the re-peg those are µGURU (100 = $0.0001). The suite passes because
#     consumption is frozen, but the dollar semantics are 10,000x smaller. Any
#     future assertion on a dollar value must account for it.
```

Definition of done: the three data tables scaled once, packs re-idded, GraphQL
types `String`, `ai-pricing.md` carrying the ceil rule, CI green.

---

## 10. What the web side already did

Committed in `rootmyandroid` (this handoff's companion):

- `/gurus`, `/marketplace`, `/pricing` (en, zh, ru, ko) and `llms.txt` now say
  **1 GURU = $1** — the $0.01 sentences are gone.
- `AGENTS.md` records the peg, the 6 decimals, the String wire type, the
  ceil rule, and the reason a whole-GURU column cannot express a charge.

Nothing on the web parses a GURU amount today (the account page shows no
balance), so this change breaks no client.

---

## 11. Boundary

Per `rootmyandroid` AGENTS.md rule 9, `rootmyandroid-api` is READ-ONLY for this
workstream: everything above was read (`src/`, `workers/`, `test/`,
`docs/`), and **nothing was written, migrated or deployed.** Ownership of the
migration, its sequencing and its rollback stays with your team.

---

## 12. Addendum — the six gates the API team added (2026-11-26)

The API team reviewed this handoff and requires all six in the same change set.
All six are correct; four of them close holes in §4–§7 above. Verified against
`4876c62`.

### G1. `scripts/make-codes.js` must be re-based — **agreed, my omission**

`const args = { count: 100, guru: 500, batch: null, dir: null }`
(`scripts/make-codes.js:29`), the usage line (`:5`) and the summary print
(`:70`) all say 500. New default: **5,000,000** µGURU (= $5), and the header
note must say µGURU, not GURU.

### G2. Old pack ids must not strand a paid invoice — **agreed, and this is money**

`PACKS[planFromIpn(...)]` is looked up in two settlement paths:
`src/index.js:621` (IPN) and `:1059` (status poll). A NOWPayments order created
as `guru_500` before the rename resolves to `undefined` after it, so a **paid**
invoice credits nothing — silently, because the `if (pack)` guard simply does
not fire.

**Prefer aliases over a state check.** A "verified no in-flight invoices"
assertion cannot be re-verified at deploy time; a lookup table can:

```js
// deprecated ids, kept until no order can carry them
const LEGACY_PACKS = {
  guru_500:  GURU_PACKS.guru_5,
  guru_2000: GURU_PACKS.guru_20,
  guru_3000: GURU_PACKS.guru_30,
}
const packFor = (id) => PACKS[id] || LEGACY_PACKS[id]
```

Then `packFor()` at the two settlement paths (`:621`, `:1059`) and nowhere
else: checkout validation (`:881`) keeps reading `PACKS[body.pack]`, so a new
invoice can never be created with a retired id. Settlement accepts both
generations; creation accepts one.

*Implemented exactly this way* — `LEGACY_PACKS` at `src/index.js:82-86`,
`packFor()` at `:87`, used at `:621` and `:1059`.

### G3. `schema_meta` + one batch, and the rename option is four columns — **agreed; the error was in the rename option, not the conversion list**

§4's conversion list already named all four columns; it was the *rename
option* in the same section that described a single `accounts.guru_balance`
rename. The full set is:

| table | columns |
|---|---|
| `accounts` | `guru_balance` |
| `guru_ledger` | `delta`, `balance_after` |
| `redeem_codes` | `guru_amount` |

So the rename guard is three table renames, not one — the marker is simpler.
**The marker insert must ride inside the same `db.batch()` as the four
UPDATEs**, otherwise a failed batch after a successful marker silently skips
the scale, and a marker written after a partial apply would scale twice. The
file already batches its migrations (`src/schema.js:267, :290, :313`).

### G4. Nine GraphQL fields go to `String`, not six — **agreed, I missed two**

`workers/rootmyandroid-graphql/src/schema.js`:
`:218` `guruBalance`, `:237` `priceGuru`, `:246` `delta`, `:247`
`balanceAfter`, `:261` `guruBalance` (GuruBalance type), `:303` `guru`
(GuruCheckout), `:323` `guru` (GuruCryptoCheckout), **`:354` `redeemed`**,
**`:355` `guruBalance`** (redeem result).

**Not converted:** `days` (`:286`) — subscription time stays `Int`; cursors
and timestamps (`:374`, `:377`, `:406`); `asn` (`:144`).

REST equivalents: `POST /v1/redeem` returns `{ redeemed, guru_balance }`
(`src/lib/redeem.js:106`) — both become strings.

### G5. API docs — **agreed, my §7 listed only one**

Re-peg `AGENTS.md`, `README.md`, `docs/ai-pricing.md`, and annotate
`docs/HANDOFF-2026-11-26-guru-cutover.md` as historical for the peg (the same
annotation the web repo applied to its copy).

### G6. Items 9 and 10 — **please name the document**

This handoff has no items 9/10: §9 is the five-point acceptance list, §10 is
what the web already shipped. If items 9/10 come from an internal review
document, quote them and they go into §9 verbatim.

### Three more that neither list covers

1. **Printed voucher artifacts.** `redeem_codes.guru_amount` ×10,000 preserves
   dollar value (500 → 5,000,000 µGURU = $5), but any plaintext `codes.txt`
   already handed out was printed as "500 GURU" and now means something else.
   Re-issue or re-describe any code that has left the building.
2. **`PLANS` must not move.** `monthly` ($5 / 30 days, `src/index.js:71`) is
   time, not GURU. It is untouched by the re-peg — and by the pack rename.
3. **Cost vs charge stay in their own units.** `ai-pricing.md`'s `cost_nusd`
   is provider cost in nano-USD; `charge_micro` (the name the API uses,
   `docs/ai-pricing.md:34`) is what the customer pays.
   Converting the provider cost to GURU would destroy the margin check.

### 12.5 What the implementation corrected in this document

Three factual errors, all found by the API team during implementation, all now
fixed above:

1. **G2 line numbers and a contradiction.** §12 named `:613`, `:873` and
   `:1051` and then said checkout rejects the old ids — two sentences that
   cannot both be true of `:873`. The implemented shape is `packFor()` at
   `:621` and `:1059` only; checkout (`:881`) reads `PACKS`.
2. **G3 attribution.** The complaint was against the *rename option*, not
   §4's conversion list, which named all four columns from the start.
3. **Field name.** `charge_nguru` was my invention; the API uses
   `charge_micro` (`docs/ai-pricing.md:34`).

### 12.6 Shipped

- `9bc6e0a` re-peg · `2eda473` test fix (`test/redeem.test.js:132` —
  `balance_after` is now a string) · `cf3dde7` verification record.
- CI `45877148312` passed `pnpm test:coverage` on blackhost and deployed the
  API, MCP and GraphQL workers. The first run caught the stale test
  expectation; the fix is in the final green run.
- Live, re-verified from this side: `GET /v1/guru/services` →
  `"price_guru": "0"` (String); `POST /v1/guru` with an unknown account →
  404, so the production `guru_balance` / `guru_ledger` re-peg is in place.
- Migration test: 340 old Halo → **1,700,000,000** µGURU; 100 → **500,000,000**.
- Their record: `rootmyandroid-api/docs/HANDOFF-2026-11-26-guru-repeg.md`.

**One check remains open and it is not a code check:** the production-data read
(item 9 above). It answers whether the "only test data" premise in §2 held.
