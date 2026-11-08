# HANDOFF — Frontend: `/gurus` page and "Guru" naming

**Date:** 2026-11-08
**From:** backend/agent (pi)
**To:** frontend team (`apps/web`)
**Status:** content-level spec — ready to build
**Revised 2026-11-08 (owner ruling):** Rootz Diagnostic Guru status
corrected BETA → PLANNED, matching the live `/rootz` page
(`apps/web/src/pages/rootz.astro`); cross-references into the agent-UX
handoff corrected to §6 (session flow), §8 (hardware-backed security) and
§10 (billing).
**Depends on:** `docs/HANDOFF-2026-11-07-agent-ux-frontend.md` (the shared
agent/billing UX rules in that document apply here by reference; this handoff
does not repeat them)

---

## 1. Owner ruling this implements

- **The "Halo" brand is discontinued.** Halo only ever existed for Guardian
  Angel, which is now on subscription billing (Guardian Angel Lite/Pro).
  Nothing new may ship under the Halo name, and existing Halo references are
  being removed across repos.
- **AI agents/assistants are called "Gurus"** in all customer-facing copy.
- **The AI balance field/display name is `guruBalance` / "Guru Balance"**
  (previously `haloBalance`). The backend is purging Halo server-side; the
  site must not reintroduce it in copy, code, or asset names.
- **Deliverable:** build `https://rootmyandroid.com/gurus`.

## 2. What a "Guru" is (canonical definition for copy)

A Guru is Root My Android's name for an AI assistant that **advises and
explains, but never acts on a device by itself.** The one-line product truth
(from the agent-UX handoff, keep verbatim or near-verbatim):

> **AI explains the evidence. Deterministic tools validate the plan. You
> approve every consequential action.**

Copy rules:

- A Guru is always an **advisor/guide/companion** — never a "tool that roots
  your phone", never an "automation".
- The word "Guru" is a **product/name prefix** (e.g. "Rootz Diagnostic Guru"),
  not a claim of infallibility. Pair every first mention on the page with the
  limits sentence: *"Gurus explain and guide. They never run device commands
  on their own, and they never see your data without your explicit consent."*
- Do **not** capitalize as "GURU"; do not abbreviate.

## 3. The `/gurus` page

**URL:** `https://rootmyandroid.com/gurus`
**Placement:** primary nav entry "Gurus" (alongside Rootz / Guardian Angel);
footer link in the product column.
**Goal:** the single page that explains what Gurus are, which Gurus exist or
are planned, and how the safety model works. It is the naming anchor for the
post-Halo world.

### 3.1 Sections (in order)

1. **Hero.** Headline direction: "Meet the Gurus." Subline: the product
   truth quote above. No CTA that implies a Guru can be "run" — CTAs point
   to the owning product (Rootz / Guardian Angel) or to `/agents`.
2. **"A Guru advises. It never acts."** — the safety model in three beats
   (reuse the agent-UX handoff §6 session-flow language):
   - Every recommendation is shown as a **plan** with exact commands and
     expected evidence.
   - **Read-only checks run first**; anything consequential waits for an
     explicit user tap.
   - If the device doesn't match what the Guru expected, it **stops** and
     shows what was seen vs. expected.
3. **The Guru roster** — cards in this order, each with a status label per
   the agent-UX handoff's `LIVE` / `BETA` / `LABS` / `PLANNED` convention
   and a link to its owning surface:

   | Guru | Status | One-liner | Link |
   |---|---|---|---|
   | Rooting Guide Guru | PLANNED | Explains your scan evidence, answers "is my phone rootable?", prepares the safe path | `/agents` |
   | Rootz Diagnostic Guru | PLANNED | Explains what Rootz found on an already-rooted device, in plain language | `/rootz` |
   | Guardian Digest Guru | PLANNED | Turns Guardian Angel's on-device filtering into daily/weekly parent-readable digests | `/guardian-angel` |

   - Do **not** invent additional Gurus. Do not mark anything LIVE.
   - Each card carries the limits sentence from §2.
   - **Model assignments (owner-approved 2026-11-08):** the default Guru is
     **Sage** (provider model `TEE/glm-5.3-flash`); the escalation Guru, used
     when other Gurus cannot answer, is **The Elder** (`TEE/kimi-k3`).
     Sage / The Elder are the public names — do NOT expose raw provider
     model IDs in consumer copy.
4. **Hardware-backed security, stated precisely** — reuse the agent-UX
   handoff §8 wording verbatim (capability-specific labels; **never** a
   generic "TEE secured" badge; cloud-side confidential inference is labeled
   as exactly that, never "on-device").
5. **How Gurus are paid for** — see §4.
6. **FAQ (3–5 items).** Suggested: "Will a Guru root my phone for me?" (No —
   it guides; you approve each step), "What does a Guru see on my device?"
   (only the evidence payload you approved, itemized before sending), "Do I
   need a subscription?" (No — Gurus are pay-per-use from Guru Balance;
   subscriptions are separate product plans).

### 3.2 SEO/OG

- Title: `Gurus — AI assistants that explain, never act | Root My Android`.
- Meta/OG description: the product truth quote.
- Standard site OG card (`twitter:card summary_large_image`); request a
  dedicated og-image for `/gurus` through the normal image pipeline
  (brand canon lives in the site's image skill — palette/character rules
  apply there, not in this handoff).

## 4. Billing display rules for Gurus

- The prepaid AI balance is displayed as **"Guru Balance"** (`guruBalance`
  in code/props). The word "Halo" must not appear anywhere.
- Guru usage is **pay-per-use**: price shown **before** the request runs,
  running balance visible during use, itemized receipt after (full rules in
  the agent-UX handoff §10 — implement by reference, don't restyle them).
- The **15% crypto discount does NOT apply to Guru usage/top-ups** (owner
  ruling: it is subscription-only). Do not show discount badges on Guru
  Balance UI.
- Guru Balance top-ups are **non-refundable** (owner ruling; same posture as
  the provider's own top-ups). This must appear at the point of top-up, in
  plain language, before payment.
- **No pricing numbers on `/gurus` yet.** Model pricing is being finalized
  backend-side (15–40% margin over provider cost, adjustable per model); the
  page links to `/agents` for capability status and defers all numbers to
  the upcoming pricing surface.

## 5. Hard rules for this build

1. No Halo references — copy, code, class names, asset filenames.
2. No generic "TEE secured" badge; hardware/privacy wording per the agent-UX
   handoff §8 only.
3. No Guru presented as able to execute device actions; every surface
   states the approval requirement.
4. Status labels come from the table above — do not re-label.
5. `/gurus` must not ship with a pricing table until the backend pricing
   surface ships (separate handoff will follow).

## 6. Open items (not blockers for this page)

- Guru Balance top-up/checkout flow — backend wallet endpoints are being
  designed (owner rulings 2026-11-08 recorded in the root HANDOFF); UI work
  starts after the API contract handoff.
- Rootz Pro BYOK ("bring your own AI key") — owner-approved, Rootz Pro tier
  only; UI affordance arrives with that backend contract.
