<!-- docs/HANDOFF-REPLY-2026-11-26-api-guru-repeg.md -->

# Reply — the six gates on the GURU re-peg

**From:** web workstream in `rootmyandroid` (the public repo)
**For:** `rootmyandroid-api`
**Status:** all six gates ACCEPTED and SHIPPED (`9bc6e0a`, `2eda473`,
`cf3dde7`). Three corrections this reply itself needed are recorded in the
Outcome section at the end.
**Answers:** your review of `HANDOFF-2026-11-26-api-guru-repeg.md`
(the ×10,000 re-peg to 1 GURU = $1.00, 6 decimals).
**Verified against:** API `4876c62`, read 2026-11-26.
**Recorded in:** the same handoff, §12 — so the document and the commit set
match.

---

## Verdict

Directionally right, arithmetic right, and the sequencing right: the web copy
is already re-pegged, so there is no coordination window — land it when the
six are in one commit.

Four of your six gates close real holes on my side (G1, G3, G4, G5). G2 is
the most important item in the whole change set and I under-weighted it. G6
needs an answer from you.

---

## G1 — `scripts/make-codes.js` re-based · ACCEPTED

My omission. `const args = { count: 100, guru: 500, batch: null, dir: null }`
(`scripts/make-codes.js:29`); the usage line (`:5`) and the summary print
(`:70`) say 500 as well.

- Default becomes **5,000,000** µGURU (= $5).
- Header note re-worded to µGURU, not GURU.
- The `--guru` integer validation stays (`:38`).

---

## G2 — old pack ids must not strand a paid invoice · ACCEPTED, and this is money

`PACKS[planFromIpn(...)]` is resolved in two settlement paths —
`src/index.js:621` (IPN) and `:1059` (status poll). A NOWPayments order
created as `guru_500` before the rename resolves to `undefined` after it, so
the `if (pack)` guard does not fire and a **paid** invoice credits nothing,
silently.

**Use aliases, not a state check.** A "verified no in-flight invoices"
assertion cannot be re-verified at deploy time; a lookup table can:

```js
// deprecated ids — kept until no order can carry them
const LEGACY_PACKS = {
  guru_500:  GURU_PACKS.guru_5,
  guru_2000: GURU_PACKS.guru_20,
  guru_3000: GURU_PACKS.guru_30,
}
const packFor = (id) => PACKS[id] || LEGACY_PACKS[id]
```

- `packFor()` at the two settlement paths (`:621`, `:1059`) and nowhere else.
- `:881` (checkout validation) keeps reading `PACKS[body.pack]`, so a new
  invoice can never be created with a retired pack id.

Settlement accepts both generations; creation accepts one.

---

## G3 — `schema_meta` marker plus one batch · ACCEPTED, and the rename option is wider than I wrote

§4's conversion list already named all four columns; the *rename option* in
that section described a single `accounts.guru_balance` rename. The real set is
four columns across three tables:

| table | columns |
|---|---|
| `accounts` | `guru_balance` |
| `guru_ledger` | `delta`, `balance_after` |
| `redeem_codes` | `guru_amount` |

So the rename guard is three table renames, not one — the marker is simpler.

**One constraint to add:** the `schema_meta` insert must ride **inside the
same `db.batch()`** as the four UPDATEs. A marker committed after a partial
apply scales twice; a marker committed before a failed batch skips the scale
permanently. The file already batches its migrations
(`src/schema.js:267, :290, :313`).

---

## G4 — nine GraphQL fields, not six · ACCEPTED

I missed two. `workers/rootmyandroid-graphql/src/schema.js`:

`String`: `:218` `guruBalance` · `:237` `priceGuru` · `:246` `delta` ·
`:247` `balanceAfter` · `:261` `guruBalance` (GuruBalance type) · `:303`
`guru` (GuruCheckout) · `:323` `guru` (GuruCryptoCheckout) · **`:354`
`redeemed`** · **`:355` `guruBalance`** (redeem result).

**Not converted:** `days` (`:286`) — subscription time stays `Int` — plus
cursors and timestamps (`:374`, `:377`, `:406`) and `asn` (`:144`).

REST twin: `POST /v1/redeem` returns `{ redeemed, guru_balance }`
(`src/lib/redeem.js:106`) — both become strings.

---

## G5 — API docs re-pegged · ACCEPTED

My §7 listed one of four:

- `AGENTS.md`
- `README.md`
- `docs/ai-pricing.md` (also carry the `ceil(nano/1000)` rule)
- `docs/HANDOFF-2026-11-26-guru-cutover.md` — annotate as historical for the
  peg only, the same way the web repo annotated its copy of that handoff.

---

## G6 — items 9 and 10 · NEED YOUR REFERENCE

This handoff has no items 9/10. §9 is a five-point acceptance list
(no whole-GURU scale · $5 credits 5,000,000 · migration idempotent · GraphQL
types · rounding), and §10 is what the web already shipped.

If items 9/10 come from your internal review document, quote them and they go
into §9 verbatim. Until then I cannot confirm or deny them.

---

## Three more, from this side

**A. Printed voucher artifacts go stale.** The ×10,000 preserves dollar value
— 500 GURU (=$5 at the old peg) becomes 5,000,000 µGURU (= $5 at the new one)
— but any `codes.txt` already handed out was printed as "500 GURU". Re-issue
or re-describe anything that has left the building. The database is correct
either way; the paper is not.

**B. `PLANS` must not move.** `monthly` ($5 / 30 days, `src/index.js:71`) is
time, not GURU. Untouched by the re-peg and by the pack rename. A conversion
applied there would turn a 30-day plan into a 30-µGURU plan.

**C. Cost and charge stay in their own units.** `ai-pricing.md`'s
`cost_nusd` is provider cost in nano-USD; `charge_micro` is what the customer
pays (`docs/ai-pricing.md:34`). Converting the provider cost to GURU would destroy the margin check the
document exists to make possible.

---

## Sequencing

No window is needed. The web publishes `1 GURU = $1` already
(`/gurus`, `/marketplace`, `/pricing` in en/zh/ru/ko, `llms.txt`), nothing on
the web parses a GURU amount (the account page shows no balance, and the Guru
endpoints the support widget calls are not implemented), and µGURU is
invisible to every client. The API can land the change set alone.

---

## Boundary

Per `rootmyandroid` AGENTS.md rule 9, `rootmyandroid-api` is READ-ONLY for
this workstream. Everything above was read (`src/`, `workers/`, `scripts/`,
`test/`, `docs/`); nothing was written, migrated or deployed. Ownership of the
change set, its sequencing and its rollback stays with your team.

---

## Outcome (2026-11-26)

Shipped the same day: `9bc6e0a` (re-peg), `2eda473` (test fix —
`test/redeem.test.js:132`, `balance_after` is a string), `cf3dde7`
(verification record). CI `45877148312` green on blackhost, API + MCP +
GraphQL deployed.

**Three things this reply got wrong**, corrected above and in the handoff's
§12.5:

1. G2 line numbers (`:613`/`:873`/`:1051` → `:621`/`:1059`, checkout `:881`)
   plus a sentence that contradicted itself about checkout.
2. G3 attribution — the defect was in the rename option, not in §4's
   conversion list, which named all four columns from the start.
3. `charge_nguru` was my invention; the API's field is `charge_micro`.

**G6 is answered:** items 9 and 10 came from the API review, not from this
handoff. Both are now in the handoff's §9 — the production-data read and the
µGURU test values (`test/redeem.test.js` 100/75/350, funding helpers 100,
which are now µGURU, i.e. 100 = $0.0001).

**Still open, and not a code check:** the production-data read. It answers
whether the "only test data" premise held. `rootmyandroid-admin` also still
queries `halo_consumed` (`rootmyandroid-admin/src/lib/analytics.js:566`) — its
deploy must follow the API's rename (`rootmyandroid-api/src/lib/analytics.js:210`).

**No web change is needed.** The web has published `1 GURU = $1` since
`a64bc2f`, and no client parses a GURU amount.
