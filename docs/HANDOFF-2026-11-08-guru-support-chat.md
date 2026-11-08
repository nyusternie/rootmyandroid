# HANDOFF — Frontend: Sage + The Elder in the Customer Support chat

**Date:** 2026-11-08
**From:** backend/agent (pi)
**To:** frontend team (`apps/web` support widget; Android support surface by reference)
**Status:** content-level spec — frontend may start against the contract in §4;
backend (rootmyandroid-api, BE-1) implements in parallel
**Depends on:** `docs/HANDOFF-2026-11-07-agent-ux-frontend.md` (shared
agent/billing UX rules — esp. §3 consent, §6 session flow, §10 billing UX —
apply here by reference; do not restyle them) and
`docs/HANDOFF-2026-11-08-gurus-page.md` (Guru naming, Sage/The Elder public
names, Guru Balance rules)

---

## 1. Owner ruling this implements

- **Sage and The Elder are wired into the Customer Support chat as the
  IMMEDIATE assistant** for help with the visitor's device.
- **Sage is FREE** for every visitor (no account, no balance, no login —
  matching the realtime support mode's no-PII model).
- **The Elder requires a Guru Balance** (pay-per-use from `guruBalance`,
  metered per the pricing record; the 15% crypto discount does NOT apply —
  subscriptions-only).
- Provider account, model assignments, margin brackets, and per-token costs
  are final and measured — see `rootmyandroid-api/docs/ai-pricing.md`
  (authoritative; numbers in §6 below are from its 2026-11-08 profiling).

## 2. What exists today (verified in code)

- Customer-facing support backend: `rootmyandroid-api` `/v1/support/*`
  (`src/lib/support.js`) — **already polling-based** (owner decision 2026-11:
  "polling first"), two modes in one store:
  - `realtime` — anonymous live chat, visitor identified by a 64-hex bearer
    token in `x-support-token` (localStorage), no email, no PII;
  - `message` — async, requires an email.
- Conversations already carry an optional self-declared `account_number`
  (16-digit, format-validated only).
- Staff side: `rootmyandroid-admin` console (`/api/support/conversations/*`,
  SIWE-gated) — **unchanged by this feature**; human staff keep the same
  queue, statuses, and reply flow.
- The visitor sends messages over plain HTTPS and polls the thread. The
  polling architecture ruling (2026-11-08) means Guru answers — even
  100-second long-logcat ones — fit the existing poll loop with **no new
  transport**.

## 3. UX flow to build

1. Visitor opens the support chat (`realtime` mode) and writes a message.
2. **Sage answers immediately and automatically** (assumption A1, §8).
   Sage turns render as assistant bubbles with the Sage name/avatar per brand
   canon and a small `Sage · free` label. First Sage turn includes the
   one-line transparency note: *"Sage is an AI Guru — it explains and
   guides; it never runs device commands."* (per the Guru limits-sentence
   rule in the /gurus handoff §2).
3. **"Ask The Elder"** affordance on every conversation (button + Sage may
   also suggest it when it cannot answer). Tapping it starts the paid flow:
   - If the conversation has no account number yet → inline 16-digit
     account-number entry (the Mullvad-style account credential; see open
     question Q3, §8).
   - Show the quoted maximum charge BEFORE the request runs, per the
     billing-UX rules (agent-UX handoff §10): feature, model public name
     ("The Elder"), estimated max charge, remaining Guru Balance.
   - On `402 insufficient_guru_balance` → show the shortfall and link the
     top-up surface. No overdraft, ever.
   - After the answer: compact receipt (tokens in/out, charge, remaining
     balance). **Never** put message contents in billing/history surfaces.
4. **"Talk to a human" is always available** — one tap moves the
   conversation to the staff queue as today. Guru turns never block,
   replace, or delay the human path; staff see Guru turns inline in the
   admin console (admin-side rendering is a separate, small follow-up).
5. Long inputs (e.g. a pasted logcat) follow the payload-preview + consent
   pattern (agent-UX handoff §3/§6 step 5): show what will be sent, name the
   provider class ("cloud confidential inference"), then send on explicit
   consent. `realtime` mode stays no-PII — logs only, and only on consent.

### 3.1 Guru bubble states

`pending` (submitted, answer not yet in the thread — show a "Sage is
thinking…" / "The Elder is thinking…" indicator inside the normal poll
cycle) → `complete` | `failed` (provider error → apology + free retry +
human-path offer; failed paid turns are NOT charged — refund/reversal per
§10 rules). Typical waits measured 2026-11-08: Sage ~4–5 s, The Elder
~5–9 s; very large logcat payloads can take ~2 min on Sage (design the
pending state for minutes, not seconds).

## 4. API contract (backend-owned; build against this)

All under the existing visitor-token auth (`x-support-token`). Message
schema is EXTENDED, not broken:

- `GET /v1/support/conversations/{id}/messages` — each message gains:
  - `author`: `'visitor' | 'team' | 'sage' | 'elder'`
  - `guru` (present on Guru turns only):
    `{ name: 'Sage' | 'The Elder', status: 'pending' | 'complete' | 'failed',
       chargeUsd: string | null, cachedShare: number | null }`
    (`chargeUsd` set on completed Elder turns; always `null`/`"0"` on Sage —
    Sage is free. Render as plain USD strings, never floats.)
- `POST /v1/support/conversations/{id}/guru`
  body `{ guru: 'sage' | 'elder', account_number?: string }`
  - `202` → Guru job accepted; the pending Guru message appears in the
    thread; poll as usual.
  - `402 { error: 'insufficient_guru_balance', requiredUsd, balanceUsd }`
  - `404 { error: 'account_not_found' }` (Elder path: the ledger existence
    check happens server-side at billing time — see Q3)
  - `429 { error: 'sage_turn_cap', resetAt }` — Sage free-turn cap reached
    (policy value pending Q2; render the reset time and offer Elder/human)
  - `409 { error: 'conversation_closed' }`
- No new endpoints are planned for the receipt: it rides on the Guru
  message's `guru.chargeUsd`.

## 5. Hard rules for this build

1. Sage is **free** — never render a price, balance requirement, or discount
   badge on Sage turns. The Elder is **pay-per-use from Guru Balance** —
   quote first, hard cap, no overdraft, receipt after (agent-UX §10).
2. Public names only: **Sage**, **The Elder**. Never expose provider model
   IDs (`TEE/...`) in copy, DOM, or asset names.
3. Gurus **explain and guide; they never act on a device** — every Guru
   surface in the chat carries that posture; no "run this for me" affordance
   attached to a Guru message.
4. Guru answers appear **only** as thread messages under the existing
   visitor token. No new cookies, no new identity, no email collection in
   realtime mode.
5. `realtime` mode stays no-PII: device logs flow only via the
   payload-preview + explicit consent step.
6. Status honesty: label support-chat Gurus `BETA` in any surface that
   shows capability status until the backend ships and is soak-tested.
7. Analytics: Guru usage events carry counts/costs ONLY — never prompt or
   message contents (agent-UX §12).

## 6. Planning data (measured 2026-11-08, API-key rail)

| | Sage (free tier) | The Elder (paid) |
|---|---:|---:|
| Typical support exchange (~800 in / 300 out) | $0.00027 cost | $0.0072 cost |
| Large logcat analysis (~11k in / 300 out) | $0.0018 cost, ~107 s | $0.0369 cost, ~8.5 s |
| Effective provider prices | $0.15/1M in, $0.50/1M out | $3/1M in, $15/1M out |
| Customer margin bracket (owner ruling) | 40% (n/a — free here) | 15%, ceil-rounded nUSD |
| Prefix caching | none observed | automatic, cached input at half list — treat as windfall only, NEVER quote assuming it |

The Elder's customer charge for the typical exchange above ≈
ceil($0.0072 × 1.15) ≈ **$0.0083**; large-logcat ≈ **$0.0425**. Quote the
max-charge line from the backend's per-request quote, never from
client-side math.

## 7. Delivery sequence (frontend)

- SC-1: `author`-aware bubbles + Sage/The Elder identity (brand canon) +
  pending/thinking state on the existing poll loop.
- SC-2: free Sage flow end-to-end (auto-answer, transparency line,
  `429 sage_turn_cap` state).
- SC-3: Elder paid flow (account-number entry, quote, 402/top-up path,
  receipt).
- SC-4: "Talk to a human" preserved + Guru-turn rendering verified against
  the admin console queue.
- SC-5: logcat payload-preview + consent step.
- SC-6: acceptance pass against agent-UX handoff §14 where applicable.

## 8. Assumptions and open questions (owner to confirm)

- **A1 (assumed):** Sage auto-answers every visitor message in realtime
  mode — "immediate assistant" read literally. If Sage should instead wait
  for an explicit "ask Sage" tap, only the trigger changes, not the
  contract.
- **Q2 (policy value needed):** the Sage free-turn cap
  (`429 sage_turn_cap`) — turns per conversation/day/visitor. Cost basis
  for the decision: ~$0.0003 per typical exchange.
- **Q3 (billing identity):** Elder debits against the visitor-supplied
  16-digit account number treated as the secret bearer credential
  (Mullvad model: knowing the number IS the authority). The existing
  support field is format-validated only and does NOT check existence —
  the Elder path will check the ledger server-side and return
  `404 account_not_found` rather than debit a typo. Confirm this posture.
- **Q4:** does a Guru turn ever auto-close or re-open a conversation, or is
  `open|closed` strictly staff-driven as today? Assumed: strictly
  staff-driven.
