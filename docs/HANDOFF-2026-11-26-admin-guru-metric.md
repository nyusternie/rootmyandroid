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
`guru_consumed`, and added a historical-row rename at
`rootmyandroid-api/src/lib/analytics.js:210`:

```sql
UPDATE events SET name = 'guru_consumed' WHERE name = 'halo_consumed'
```

**Commit attribution — corrected 2026-11-26.** That `UPDATE` was added in
`6313e2b` ("docs: record the shipped GURU cutover", 12:58:16 -0500), one
commit *after* the cutover `4876c62` (12:48:57 -0500). `4876c62` touched
`analytics.js` only in comments (`:92`). The API's own cutover handoff
records the deploy of `4876c62` alone (CI `45870899506`); **no repo document
records a deploy of `6313e2b`**, so whether the `UPDATE` has run in
production is an open question — see §5.1.

Both workers bind the **same** D1 — `rootmyandroid-analytics`
(`29cb0c75-8ecb-4ebf-be4e-4965c35405fa`), per the admin's own
`wrangler.jsonc:54-58` and the API's `wrangler.jsonc:34-43`. If the rename
has run, this dashboard is reading a table that no longer holds the old
name.

The admin still asks for the old name:

```js
// src/lib/analytics.js:566
AND name IN ('account_created', 'checkout_started', 'payment_completed',
             'halo_consumed', 'voucher_redeemed')
```

`halo_consumed` in that list no longer matches any row — the other four
names (`account_created`, `checkout_started`, `payment_completed`,
`voucher_redeemed`) still match. **No data was lost**: the events are there
under the new name. The card reports 0 through the `|| 0` at `:1050`, which
looks exactly like "nobody used the service" — the worst possible failure
mode for a dashboard.

---

## 2. The change — five code points and two test lines

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

**Correction 2026-11-26: the binding is not read-only.** No read-only flag
exists in `wrangler.jsonc` — only a comment claiming it
(`wrangler.jsonc:52-53`, and `:14`). The worker writes the `goals` table into
that same D1: `INSERT` at `src/lib/analytics.js:232`, `DELETE` at `:244`,
called from `src/index.js:334` and `:341`. The comment and the feature
contradict each other.

The instruction stands, for a different reason: `events` is the API's table,
written by its collector, and the historical rename is the API's one-shot.
A second rename from the dashboard would be a no-op at best and a
double-apply at worst. If rows are still named `halo_consumed`, that is
evidence the API's one-shot has not run — report it (§5.1) rather than
fixing it here.

---

## 4. What this handoff does NOT require

- **The µGURU re-peg is not your problem.** The admin reads event *names*,
  never GURU *amounts*; there is no balance field in any payload. Nothing in
  the dashboard scales.
- **No cached snapshots to invalidate.** `ADMIN_KV` holds only auth nonces and
  sessions (`src/index.js:128,175,188,202,210`); funnel numbers are computed
  per request, so no stale key carries the old field name.
- **`SNAPSHOT_META`** (the agent-facing glossary, `src/lib/analytics.js:132`)
  does not mention Halo — no change needed there. **Correction:** it has no
  `funnel` entry at all; the only funnel it describes is `apk_funnel`
  (`:151`), the APK click → sideload → download funnel, which is unrelated to
  `funnel.guru_consumed`. Do not edit it as part of this change.

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

### 5.1 The one premise this handoff cannot verify

Everything above assumes the historical rows have already been renamed in
production. That assumption rests on three things, and **none of them is
established by the repo**:

1. That `6313e2b` was deployed. Its push triggers the deploy job
   (`rootmyandroid-api/.github/workflows/ci.yml:43-47`), but no CI run record
   for that commit exists in the repository, and the cutover handoff documents
   only the deploy of `4876c62`.
2. That at least one analytics write has happened since that deploy. The
   `UPDATE` is **lazy**: it fires from `ensureAnalyticsSchemaOnce` on analytics
   writes (`rootmyandroid-api/src/lib/analytics.js:457, 485, 573, 605, 711`),
   not at deploy time.
3. The live split of old and new names:

```sql
SELECT name, COUNT(*) AS n FROM events
 WHERE name IN ('halo_consumed','guru_consumed') GROUP BY name;
```

**What the dashboard shows if this is wrong:** if the `UPDATE` has not run,
both names are in use, and a card that queries only `guru_consumed` reports a
count that is too low rather than zero — a quieter version of the same bug.
That is why the metric rename and the verification belong in one change set.

**D1 access, checked 2026-11-26.** The query above cannot be run from this
workstation or from the sanctioned credential stores:

- `blackhost:/root/.cloudflare/api_token` is active but account-scoped: it
  cannot list accounts and returns `7403` for the account id used here.
- `sansbank:~/.cloudflare/api-token-d1` is active and D1-capable, but it is
  scoped to **Sansbank DAO** (`cff27acd0f4e86139f6cf3f1a295d4b0`), whose D1
  databases are `dashswap`, `dashswap-testnet`, `platform`, `dao`, `yappr`,
  `evonext`, `bootstrap`, `logs` — `rootmyandroid-analytics` is not among
  them, so the query returns `7404 could not be found`.
- `apecsdev:~/.config/cloudflare/api_token` is the same token as blackhost's
  (rule 11 dual store).

The rootmyandroid account id lives only in a GitHub secret
(`CLOUDFLARE_ACCOUNT_ID`, `ci.yml:68,74,80`), so the check has to be run by
whoever holds that credential — the API team, at deploy time.

Definition of done: the five code points and the two test lines renamed, CI
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
