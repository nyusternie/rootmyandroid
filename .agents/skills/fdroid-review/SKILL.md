---
name: fdroid-review
description: F-Droid community review of other people's fdroiddata merge requests — pool selection, MR artifact verification, device testing with PCAPdroid, the official report template, and the policy rules that must never be asserted. Use for ANY "review an F-Droid MR" task.
---

# F-Droid community review — skill suite

Source of truth, re-fetched every round:
<https://gitlab.com/fdroid/wiki/-/wikis/Tips-for-fdroiddata-contributors/Reviewing-new-apps>
(`glab api "projects/fdroid%2Fwiki/wikis/Tips-for-fdroiddata-contributors%2FReviewing-new-apps" | jq -r .content`)

This directory is the operational version of that page plus every rule we paid for.
SKILL.md is the map; the rest is loaded on demand.

| file | load when |
|---|---|
| `procedure.md` | always — the phases, with exact commands |
| `policy.md` | before writing Policy / Permissions rows, and before ANY anti-feature sentence |
| `report-template.md` | when composing the comment (verbatim official HTML) |
| `pitfalls.md` | before posting — the checklist of every mistake made so far |
| `rounds/` | read the latest before starting; append one file per round |
| `tools/vet.sh <iid>` | candidate vetting (pipeline, notes, membership) |
| `tools/pool.sh` | ranking the `review-requested` pool |
| `tools/codequality.sh <project> <pipeline>` | reading the Reports-tab codequality data |
| `tools/mr-apk.sh <iid>` | getting the exact APK to install |

## Non-negotiables

1. Pool is `review-requested` + **fewest notes**. "No outside review" means no
   **non-maintainer** comment — test membership, never the count alone.
2. `INTERNET` ⇒ PCAPdroid started **before** the app opens. `ss` samples and
   `strings` on the binary are not a network check.
3. The official template, every row answered. Freeform prose is not a review.
4. **No policy verdicts.** Present evidence (hosts, `file:line`) and leave the
   label decision to the maintainer. linsui, note 4294629299: "TetheredNet
   doesn't apply to self-host servers."
5. No meta-commentary. The report discusses the app, never the reviewer.
6. Nothing is claimed without a `file:line`, a capture entry, or a job-trace
   line. Counts are computed, never eyeballed.
7. Never edit the MR description, never touch labels, never merge.
8. No device wipes; restore every setting you toggled (stop the capture,
   `adb uninstall` only the test package if you uninstall at all).

## Round protocol — what makes the suite improve

- **Before:** read `rounds/` (latest file) and re-fetch the wiki.
- **During:** follow `procedure.md`; when reality differs from the suite, write
  the difference down instead of working around it silently.
- **After:** append `rounds/YYYY-MM-DD.md` — pool snapshot, picks, findings,
  maintainer verdicts, and **deltas** (what changed in this suite because of
  the round). A dismissed claim becomes a `pitfalls.md` entry in the same
  commit.

## Status

- v2 — 2026-11-23. Restructured from a single 93-line snapshot into this suite
  after round 3 exposed four gaps (P5, P6, P10, P11 in `pitfalls.md`).
- Rounds recorded: `2026-11-21` (3 reviews, rewritten in place), `2026-11-22`
  (2 reviews + the TetheredNet ruling), `2026-11-23` (2 reviews drafted).
