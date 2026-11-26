<!-- docs/HANDOFF-2026-11-26-api-guru-repeg.md -->

# Handoff — `rootmyandroid-api`: GURU re-peg to $1.00 with 6 decimals

**From:** web workstream in `rootmyandroid` (the public repo)
**For:** `rootmyandroid-api` (REST worker + GraphQL worker + scripts)
**Status:** PROPOSED — nothing applied. This is a request.
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
grep -rn "guru_500\|guru_2000\|guru_3000" src workers scripts   # expect: 0

# 2. a $5 purchase credits exactly 5,000,000
#    (pack guru_5 settled → guru_balance "5000000")

# 3. migration is idempotent: run ensureSchema twice, balance unchanged

# 4. GraphQL types
#    { guruBalance { guruBalance } } → String, e.g. "5000000"

# 5. rounding
#    a 525,000 nUSD charge debits exactly 525 µGURU
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
