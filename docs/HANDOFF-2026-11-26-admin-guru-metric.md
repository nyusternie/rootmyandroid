<!-- docs/HANDOFF-2026-11-26-admin-guru-metric.md -->

# Handoff — `rootmyandroid-admin`: the funnel metric renamed under you

**From:** web workstream in `rootmyandroid` (the public repo)
**For:** `rootmyandroid-admin` (Admin Center worker + `public/app.js`)
**Status:** PROPOSED — nothing applied. This is a request.
**Context:** the Halo → GURU cutover shipped in `rootmyandroid-api` as
`4876c62`, and GURU was then re-pegged to $1.00 with 6 decimals
(`HANDOFF-2026-11-26-api-guru-repeg.md`).
**Baseline:** admin `master` at `f50e2e8`, read 2026-11-26.

---

## 1. What happened, and why the card is silent

The API renamed the server-side analytics event `halo_consumed` →
`guru_consumed` **and renamed the historical rows in place**
(`rootmyandroid-api/src/lib/analytics.js:210`:

```sql
UPDATE events SET name = 'guru_consumed' WHERE name = 'halo_consumed'
```

Both workers bind the **same** D1 — `rootmyandroid-analytics`
(`29cb0c75-8ecb-4ebf-be4e-4965c35405fa`), per the admin's own
`wrangler.jsonc:53-58` and the API's `wrangler.jsonc:34-43`. So the rename
already happened in the database this dashboard reads.

The admin still asks for the old name:

```js
// src/lib/analytics.js:566
AND name IN ('account_created', 'checkout_started', 'payment_completed',
             'halo_consumed', 'voucher_redeemed')
```

That `IN` list no longer matches any row. **No data was lost** — the events
are all there under the new name. The card simply reports 0, which looks
exactly like "nobody used the service", which is the worst possible failure
mode for a dashboard.

---

## 2. The change — four code points and one test

| file:line | today | after |
|---|---|---|
| `src/lib/analytics.js:320` | `halo_consumed: 0,` (empty-payload default) | `guru_consumed: 0,` |
| `src/lib/analytics.js:566` | `'halo_consumed'` in the `IN` list | `'guru_consumed'` |
| `src/lib/analytics.js:1050` | `halo_consumed: funnelCounts.halo_consumed \|\| 0,` | `guru_consumed: funnelCounts.guru_consumed \|\| 0,` |
| `public/app.js:978` | `'<h3>Halo &amp; vouchers</h3>'` | `'<h3>GURU &amp; vouchers</h3>'` |
| `public/app.js:979` | `Halo consumptions: …` | `GURU consumptions: …` |
| `test/analytics.test.js:202` | inserts `name: 'halo_consumed'` | `'guru_consumed'` |
| `test/analytics.test.js:403` | expects `body.funnel.halo_consumed` | `guru_consumed` |

The three `analytics.js` sites must move together: the default object, the SQL
filter and the projection. Renaming only the projection yields `undefined ||
0` = 0 — the same silent zero with extra steps.

**Label wording:** the metric counts *consume events*, not amounts (the
consumption path is frozen at `charged: 0` by owner ruling 2026-11-04). Keep
the label a count, not a value: "GURU consumptions" preserves the existing
meaning. Do not turn it into a money figure — the admin does not read amounts.

---

## 3. Do not backfill, and do not write

`rootmyandroid-admin` binds `ANALYTICS_DB` **read-only**, and the rename has
already been applied upstream. There is nothing to migrate here: this is a
rename of the key the dashboard asks for, and nothing else.

If you find rows still named `halo_consumed`, that means the API's one-shot
did not run against that database — report it rather than fixing it from the
dashboard.

---

## 4. What this handoff does NOT require

- **The µGURU re-peg is not your problem.** The admin reads event *names*,
  never GURU *amounts*; there is no balance field in any payload. Nothing in
  the dashboard scales.
- **No cached snapshots to invalidate.** `ADMIN_KV` holds only auth nonces and
  sessions (`src/index.js:128,175,188,202,210`); funnel numbers are computed
  per request, so no stale key carries the old field name.
- **`SNAPSHOT_META`** (the agent-facing glossary, `src/lib/analytics.js:132`)
  does not mention Halo — no change needed there. Re-read it after the edit to
  confirm the funnel description still matches the field it documents.

---

## 5. Acceptance

```sh
# 1. no billing-unit Halo left in code
grep -rniI "halo" src public test        # expect: 0

# 2. the only remaining hit in the repo is history
grep -rniI "halo" docs                   # expect: roadmap-2026-11-10.md:394-395

# 3. the number is non-zero again where it should be
#    pick a window in which the API recorded a guru_consumed event and
#    confirm the card and GET /api/analytics/* agree with:
#      SELECT COUNT(*) FROM events WHERE name='guru_consumed' AND ts >= …
```

Definition of done: the four code points and the two test lines renamed, CI
green, and the card showing the same count that the old label showed before
the API cutover.

---

## 6. Deploy

`.github/workflows/ci.yml` is a test-gated deploy: the `deploy` job needs
`test` and runs `pnpm deploy` on push. A push to `master` is the deploy.

---

## 7. One loose end this closes

`docs/session-notes/roadmap-2026-11-10.md:394-395` recorded the observation
that `POST /v1/accounts` still emitted `halo_balance` — *"possible handoff
doc for the API team, low priority"*. The API has since renamed it to
`guru_balance`, so that note is resolved; marking it as such is optional
bookkeeping in a private repo.

---

## 8. Boundary

Per `rootmyandroid` AGENTS.md rule 9, `rootmyandroid-admin` is READ-ONLY for
this workstream: everything above was read (`src/`, `public/`, `test/`,
`wrangler.jsonc`, `.github/`), and **nothing was written, committed or
deployed.** Ownership of the change and its deploy stays with your team.
