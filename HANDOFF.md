# HANDOFF — "Nitro" → "Halo" rebrand (2026-11-03)

**From:** API/Admin side (rootmyandroid-api)
**For:** Web/front-end team (rootmyandroid marketing site + account/pay pages)
**Status:** PROPOSED — owner-approved direction, decisions below need sign-off before either side ships

---

## 1. Why

- **Audience shift:** iOS users arriving for parental controls ("Guardian Angel").
  "Nitro" is gamer/speed-coded; "Halo" completes the Guardian Angel metaphor
  and reads protection-first.
- **Collision:** Discord Nitro owns the "digital subscription credits" category.
  Unwinnable SEO, user confusion, trademark-adjacent risk.
- **Window:** 68 accounts, 1 ledger row, no external API consumers. Cheapest
  this rename will ever be.

## 2. Decisions needed (owner + web team)

| # | Question | Recommendation |
|---|----------|----------------|
| D1 | Casing: "Halo" vs "HALO" vs unit "HALOs"? | **RULED (owner, 2026-11-03): product Halo, unit Halo, plural Halos.** All-caps reads like an acronym and shouts in balance displays. |
| D2 | Sequencing | **Coordinated cutover window** (see §5) — copy-first is NOT possible under a clean break: the nitro endpoints disappear when the API deploys. |
| D3 | API strategy | **HARD CUTOVER — no aliases, nothing kept indefinitely** (owner ruling, 2026-11-03). |
| D4 | Does "Nitro" survive anywhere user-facing? | No — full copy sweep (incl. emails, invoice descriptions, support macros). |
| D5 | Schema/data included in "clean"? | Recommend **yes**: rename `nitro_balance`→`halo_balance`, `nitro_ledger`→`halo_ledger`, and UPDATE historical `nitro_consumed` analytics rows to `halo_consumed`. Cheap at current scale (68 accounts, 1 ledger row); the only moment it will ever be this cheap. |
| D6 | Retired BTCPay rail (`/v1/billing/nitro/crypto/checkout`) | Recommend **delete outright** in the same pass — product decision to drop BTCPay is already final; a clean rename is the natural moment to remove the dead rail instead of porting it. |

## 3. What does NOT change

- **Pricing/economics:** $5 = 100 base rate; packs $5/100, $20/500, $30/1000.
  Pack pricing is owner-approved (2026-10-24) and untouched by a rename.
- **Account model, balances, ledger history.** Existing balances carry over
  1:1 — this is a rename, not a new currency.
- **Service consume prices** (cloud_backup 20, guardian_sync 10,
  audit_report 5) — unchanged.
- **DB internals** are renamed in place per D5 (`nitro_balance` →
  `halo_balance`, `nitro_ledger` → `halo_ledger`, `redeem_codes.nitro_amount`
  → `halo_amount`) by `ensureSchema()` before the CREATE pass — data
  preserved, idempotent. (§3 earlier said "kept"; D5 overrules — web
  review item 1.)

## 4. Current API surface (as deployed 2026-11-03)

**Endpoints (public):**
- `POST /v1/billing/nitro/checkout` — invoice rail (NOWPayments hosted invoice URL)
- `POST /v1/billing/nitro/payment` — whitelabel rail (deposit address returned)
- `POST /v1/billing/nitro/crypto/checkout` — BTCPay rail, **retired product-side** (do not surface)

**Pack ids:** `nitro_100` ($5), `nitro_500` ($20), `nitro_1000` ($30)

**Response fields web consumes today:**
- Checkout: `{ ok, rail, invoice_id, invoice_url, pack, nitro, price_amount, price_currency, account_number }`
  — note: `nitro` is the numeric credit amount; `pack` echoes the pack id.
  **No display labels are returned** — all marketing strings are yours.
- Account status: `nitro_balance` (number) pre-cutover — renamed to
  `halo_balance` everywhere in the cutover deploy (§5.3); render as "Halo
  balance" in UI. (The earlier "stays for compatibility" sentence was stale
  alias-strategy text — web review item 2.)

**Invoice/payment metadata:** NOWPayments order descriptions are generated
server-side (currently "Root My Android 100 Nitro — <acct>"). These appear on
the hosted invoice page. API side switches these to Halo wording in the same
cutover deploy — flag anything you hardcode around them.

**Analytics:** consume events are recorded as `nitro_consumed` (detail = service
id) pre-cutover. The cutover deploy single-emits `halo_consumed` and historical
rows are renamed in place (`UPDATE events SET name='halo_consumed' WHERE
name='nitro_consumed'`) — dashboards stay continuous without OR-ing. (The
earlier "dual-emit" sentence was stale alias-strategy text — web review
item 3.)

## 5. API strategy — HARD CUTOVER (owner ruling: NO aliases, nothing kept)

**One coordinated release; nitro naming is removed everywhere in the same
deploy.** No alias layer, no deprecation window, no legacy fields.

API side (rootmyandroid-api):
1. `/v1/billing/nitro/*` endpoints **deleted**; replaced by
   `/v1/billing/halo/checkout` + `/v1/billing/halo/payment`. Requests to the
   old paths get the router's standard `not_found` — no redirects.
2. Pack ids become `halo_100|halo_500|halo_1000` ONLY; `nitro_*` ids are
   rejected (`unknown_pack`).
3. Response fields renamed: `nitro`→`halo`, `nitro_balance`→`halo_balance`
   everywhere (checkout + account endpoints). No legacy keys kept.
4. Invoice/order descriptions reworded ("Root My Android 100 Halo — <acct>").
5. Analytics: emit `halo_consumed`; historical `nitro_consumed` rows renamed
   in place (D5).
6. Schema (D5): `accounts.nitro_balance`→`halo_balance`,
   `nitro_ledger`→`halo_ledger` via SQLite ALTER ... RENAME (data preserved).
7. BTCPay crypto rail (D6): endpoint + handler deleted, not ported.
8. Tests renamed to match; CI green required before deploy (repo rule).

**Cutover sequencing (checkout downtime ~minutes, everything else seamless):**
0. **iOS FIRST (added per §8): the app update carrying `halo_balance ??
   nitro_balance ?? 0` tolerance ships and is AVAILABLE before any API
   deploy** — shipped builds read `nitro_balance ?? 0` and would silently
   render 0 balances post-cutover. Laggards who never update keep seeing 0
   until they do (benign, self-heals; balances themselves are untouched).
   Android is copy-only (no constraint).
1. Web team prepares the full rename on a branch (copy + endpoint paths +
   pack ids + response fields) — do NOT merge.
2. Owner picks a low-traffic window. API deploys first: from that second,
   `/v1/billing/nitro/*` is 404 and `nitro_balance` is absent from account
   responses — **the live site's balance display + checkout buttons break
   until step 3 completes.**
3. Web deploys immediately after (same window). Verify: balance renders,
   checkout creates a halo invoice, consume path works.
4. Rollback plan: `git revert` + redeploy on BOTH sides (each side's prior
   commit is the rollback target; no data migration is irreversible — schema
   renames are two-way).

**Web team action:** prepare the branch now; cutover window scheduled with
the owner once both branches are green.

## 6. Copy sweep checklist (web side)

- [ ] Marketing pages: pricing, features, FAQ
- [ ] `/account` (balance display, purchase flow, pack cards)
- [ ] `/pay` + `/scan` entry points
- [ ] Transactional strings: success/cancel pages (`?paid=1`, `?cancelled=1`)
- [ ] Support widget quick-replies / macros
- [ ] Any hardcoded "Nitro" in emails you own (API-side alerts are ours)

## 7. Open questions for web team

1. Any client-side caching of pack catalogs/strings (service worker, static
   JSON) that would need a cache-bust on cutover?
2. Do you read `nitro_balance` anywhere else than `/account`?
3. Do you want a `GET /v1/billing/packs` catalog endpoint so pack labels
   become server-driven post-rebrand (single source of truth)? Cheap to add;
   say the word.

---

## 8. Web-side response (2026-11-03) — branch ready, CI green, merge held

**Branch:** `halo-rebrand` on nyusternie/rootmyandroid, PR #2 (DO NOT MERGE
until the window) — lint/test/build green; deploy skipped (master-only).

**Owner rulings since §1–§7 were written:**
- D1 RULED (2026-11-03): product **Halo**, unit **Halo**, plural **Halos**.
- Trademark pass (formerly §1 ⚠️): **DROPPED** — owner ruled there is no
  trademark issue (2026-11-03); the bullet has been removed from §1.
- Root docs sweep (AGENTS.md / HANDOFF.md in rootmyandroid): **APPROVED and
  shipped** on the web branch — zero "nitro" mentions remain in those docs.

**Contract points the web branch ASSUMED (not explicit in §4/§5) — API side
must confirm before the window:**

| # | Web branch now calls | Basis / gap |
|---|----------------------|-------------|
| A1 | `POST /v1/halo` (balance + recent ledger) | Mirrors the §5.1 pattern; §4 names the `nitro_balance` field but never lists this path |
| A2 | `GET /v1/halo/services` (PRO services catalog) | The catalog endpoint is nitro-named today yet absent from §4's endpoint list and §5's cutover items; if it is not renamed in the same deploy, `/account`'s services section breaks at cutover |
| A3 | Catalog item field `price_halo` (was `price_nitro`) | Inferred from §5.3 "everywhere" |

Explicitly covered by §5 (no clarification needed): `/v1/billing/halo/checkout`,
`/v1/billing/halo/payment`, pack ids `halo_100/500/1000`, response fields
`halo` + `halo_balance`, BTCPay rail deletion (the web + shared clients'
`createNitroCryptoCheckout` functions are deleted on the branch too, per D6).

**Mobile sequencing constraint (new — affects §5 ordering):** the currently
shipped iOS build reads `nitro_balance` with a `?? 0` fallback, so a hard
cutover would silently render a **0 balance** until users update. The
`halo-rebrand` branch adds client-side tolerance (`halo_balance ??
nitro_balance ?? 0`), which works against both API generations.
Recommendation: **ship the app update BEFORE the API deploys**, then drop the
fallback in a later release. Android is mock-only (no API balance read) —
copy-only change, no constraint.

**Web-side inventory (all swept on the branch):** endpoint paths in
`apps/web/src/lib/api.js` + `packages/shared/src/api.ts`; four `halo_balance`
reads + default pack + `NITRO_BY_PACK` keys in `account.ts` / `deposit.ts`;
`/nitro` → `/halo` page rename (+301 in `public/_redirects`); nav + default
meta description + Offer schema (mirrors visible copy per the SEO rule);
terms / refunds / privacy copy; support-widget placeholder; deposit status
strings; Android mock UI; iOS status line. Internal identifiers renamed too
(owner-directed, 2026-11-03): client fns `createHaloCheckout` /
`createHaloPayment` / `getHaloBalance` / `getHaloServices` (web + shared),
`setHaloBalance`, `HALO_BY_PACK`, `DepositData.halo`, `.halo-*` CSS classes
and DOM ids, `MOCK_HALO`, `HaloBar`, iOS `halo` state field. The only
remaining "nitro" strings in tracked source are intentional: the iOS
`nitro_balance` wire-field fallback (pre-cutover API compat, marked for
post-cutover removal) and the literal `/nitro` path in `_redirects` (the
301 source). Root docs (AGENTS.md / HANDOFF.md) swept to zero mentions.

**Open items remaining on the API side (from the web review):**
1. §3 vs §5.6 — do `nitro_balance` / `nitro_ledger` columns get renamed (D5)
   or kept (§3)? The sections contradict; rule one.
2. §4 ("`nitro_balance` will stay in v1 responses for compatibility") vs
   §5.3 ("no legacy keys kept") — the §4 sentence needs a present-tense fix.
3. §4 ("dual-emit `halo_consumed` going forward") vs §5.5 (single-emit +
   history renamed in place) — the admin dashboards need to know which.

---

## 9. API-side response (2026-11-03) — A1–A3 confirmed, PR green

**Branch:** `halo-cutover` on rootmyandroid-api, PR #1 — CI green (163/163
on blackhost), merge held for the window.

**Contract confirmations (verified in branch code):**
- A1 `POST /v1/halo` — CONFIRMED (router entry; renamed from `/v1/nitro`).
- A2 `GET /v1/halo/services` — CONFIRMED (renamed; catalog emits from
  `HALO_SERVICE_PRICES`).
- A3 catalog field `price_halo` — CONFIRMED (the services endpoint renames
  the item field; tests pin it).

**Web review items resolved:**
1. §3 corrected: DB internals ARE renamed (D5) — see §3.
2. §4 corrected: `nitro_balance` does NOT survive — renamed to
   `halo_balance` in the cutover deploy — see §4.
3. §4 corrected: single-emit `halo_consumed` + history renamed in place —
   see §4.

**Sequencing adopted:** iOS-first constraint added as §5 step 0; the window
is gated on the app update's availability (owner to confirm App Store
timing), then steps 1–4 as written.

**Internal identifiers:** the owner word was GIVEN (2026-11-03) and the web
branch renamed them all in `f9811a4` — client fns, `HALO_BY_PACK`, `.halo-*`
CSS classes + DOM ids, `MOCK_HALO`, `HaloBar`, iOS state field (full list in
§8). API side has no such residue (only migration probes reference the old
names).

---

## 10. PRICING-MODEL CHANGE (owner rulings 2026-11-04) — API SHIPPED; web copy must match

**The Halo unit has been repriced and the à-la-carte consumption model is
being retired in favor of service plans (30-day Basic/Elite + a 365-day
Pro lane).** This section is the
authoritative contract for the web copy sweep already in motion.

### 10.1 What changed (live on the API now — PR #3 + manual deploy of the gated tree)

- **$5 = 1 Halo** (was $5 = 100 Halo). Packs renamed + repriced:

  | pack id   | price | credits |
  |-----------|-------|---------|
  | `halo_1`  | $5    | 1 Halo  |
  | `halo_4`  | $20   | 4 Halo  |
  | `halo_6`  | $30   | 6 Halo  |

  Linear $5 per Halo — no tier discounts while the plans are being defined.
  Old pack ids (`halo_100`/`halo_500`/`halo_1000`) are REJECTED
  (`unknown_pack`); the error response lists the new ids.
- **Consumption frozen:** `POST /v1/halo/consume` and the server-side
  service gates (cloud backups, guardian pairing, audit saves) succeed with
  `charged: 0` — no balance needed, no balance mutation, no ledger row.
  `GET /v1/halo/services` still returns the three service slugs but with
  **`price_halo: 0`**.
- **Response field names unchanged:** `halo`, `halo_balance`, `charged`,
  `price_halo` — only the values change. No client-code shape changes
  required for this step.
- **Existing credit converted ÷100** (dollar-equivalence preserved):
  production accounts 100 → 1 Halo each; ledger deltas/balance_after
  converted in place. Redeem codes: none outstanding. Any code generated
  from now on is in NEW units (`make-codes.js --halo 1` = one $5 Halo).

### 10.2 The 3 plan tiers — CONTENTS DEFINED (owner rulings 2026-11-04)

Server-side source of truth: **`GET /v1/halo/plans`** (public catalog,
same pattern as `/v1/halo/services`). TWO LANES (owner ruling 2026-11-04):
Basic→Elite are CUMULATIVE monthly subscriptions; Pro is an INDEPENDENT
yearly unlock — a LIMITED professional feature set that combines with
either monthly plan or stands alone ("a user can unlock Pro and still
subscribe to either Basic or Elite, or they may ONLY unlock Pro, or they
may ONLY subscribe and NEVER unlock Pro").

| plan  | price        | period  | features (slugs)                               |
|-------|--------------|---------|------------------------------------------------|
| Basic | 1 Halo ($5)  | 30 days | `read_apps`, `read_messages`, `read_call_logs` |
| Elite | 2 Halo ($10) | 30 days | Basic + `view_media`, `view_camera_video`      |
| Pro   | 3 Halo ($15) | 365 days| `terminal_editor`, `log_analysis` (limited pro lane) |

- **Advanced was renamed Elite** (owner ruling 2026-11-04).
- **Pro is API-gated** (`api_gated: true`): entitled features must verify
  an active entitlement with the API before enabling. The entitlement
  endpoint lands with plan redemption (Phase 2 API PR) and must support
  BOTH 30-day and 365-day windows — the yearly Pro SKU is new.
- [ ] OWNER TO CONFIRM: placement of `realtime_monitoring` +
  `smart_triggers` (cumulative-Pro under the v1 table) — stay in the
  independent Pro lane, or move to Elite?
- The Android mock (`MOCK_PLANS` in `apps/android/App.tsx`) renders these
  tiers and needs the Elite rename + Pro re-lane.
- A redemption endpoint (spend N Halo → plan window) will follow in a
  later API PR; the consume path + services catalog will be RETIRED when
  the plans land (not frozen — removed).
- Interim UI guidance: do NOT present services as purchasable line items;
  the services catalog reporting 0 means "included/free while plans are
  finalized." Balances are now small integers (1 Halo = $5).

### 10.3 What web must ship

- Pack purchase UI: ids `halo_1`/`halo_4`/`halo_6`, "$5 = 1 Halo".
- Balance displays: values are now single-digit — no formatting changes
  needed, but any "100 Halo = $5" explainer copy is wrong and must go.
- Services sections: either drop pricing or reflect "included" state until
  plan presentation replaces them.

---

*Owner context: rebrand direction approved 2026-11-03 with a HARD cutover
ruling (no aliases, nothing kept indefinitely); pricing owner-locked and
repriced 2026-11-04 (§10). Both sides green (web §8; API §9 — PR #1,
163/163). A1–A3 confirmed. The window is gated on iOS app-update
availability (§5 step 0), then the owner picks the slot.*
