# Pitfalls — every mistake this suite exists to prevent

Read this immediately before posting. A new pitfall is appended in the same
commit as the round that produced it.

## P1 — Wrong pool (2026-11-21)

**Symptom:** reviewed MRs carrying `New App` with zero notes; the pool is
`review-requested` + **fewest notes**.
**Gate:** `tools/pool.sh` + `tools/vet.sh` (phase 1).

## P2 — No network capture (2026-11-21)

**Symptom:** `INTERNET` apps reviewed without PCAPdroid; `ss` samples and
`strings` were offered as a substitute. They miss short-lived connections.
**Gate:** phase 5 — capture started before the first launch; the report states
the capture was running.

## P3 — Freeform prose instead of the template (2026-11-21)

**Symptom:** three reviews posted as prose, later rewritten in place.
**Gate:** `report-template.md` (verbatim wiki HTML), every row answered.

## P4 — Policy verdict on a self-hosted service (2026-11-22)

**Symptom:** "`TetheredNet` missing (client for a self-hosted server)" on
!56044. linsui, note 4294629299: *"TetheredNet doesn't apply to self-host
servers."*
**Gate:** `policy.md` rule zero. Evidence only, no anti-feature verdicts.

## P5 — The codequality filter that hides the warning (2026-11-23)

**Symptom:** entries were filtered with `grep -v 'R8 Marker'`, which also
removes `APK has no R8 Marker, R8 is not used` — the exact warning class our
own MR carried. The check reported "no warnings" while being structurally
unable to see one.
**Gate:** `tools/codequality.sh` classifies by **category**, never by
description substring.

## P6 — Severity is not a discriminator (2026-11-23)

**Symptom:** assuming `minor` means "informational". Permissions are `minor`
too; the warning and the permission rows share the severity. Only the category
(`r8_marker` vs `permission`) separates them.
**Gate:** `tools/codequality.sh` prints `CATEGORY :: description` and flags
unknown categories as `CHECK`.

## P7 — Installing the unsigned build artifact (2026-11-23)

**Symptom:** `tmp/<pkg>_<code>.apk` from the `fdroid build` artifact fails
`apksigner verify` (`Missing META-INF/MANIFEST.MF`); `fdroid publish` implants
the signature afterwards. Installing the upstream release instead tests the
wrong bytes.
**Gate:** `tools/mr-apk.sh` installs `tmp/binaries/*.binary.apk` and asserts
its certificate SHA-256 equals the recipe's `AllowedAPKSigningKeys`.

## P8 — Absolute claims from a single grep (2026-11-23)

**Symptom:** "`INTERNET` is used **only** by sync/pairing", "**nothing else**
opens a socket", "the **only** HTTP client" — each from one grep for a handful
of client libraries.
**Gate:** scope every claim to what was searched ("no other HTTP client is
referenced in `android/app/src/main`"), or cite each call site.

## P9 — Counts and line numbers by eyeball (2026-11-23)

**Symptom:** "14 entries" for a 13-entry report, "15" for 14; a manifest
comment cited as 20-23 when it spans 21-24.
**Gate:** counts come from `wc -l` / `jq length`; line numbers from
`sed -n 'A,Bp'` printed in the same command block that writes them.

## P10 — Policy row written without reading the policy (2026-11-23)

**Symptom:** "Features don't violate the Inclusion Policy" ticked before the
Inclusion Policy had been opened.
**Gate:** `policy.md` checklist; the row cites the licence file, the tracker
scan and the reproducible-build line.

## P11 — The wiki's removal question skipped (2026-11-23)

**Symptom:** no connection observed for Spunto, but the required question
("can `INTERNET` be removed?") was replaced by a weaker remark.
**Gate:** `policy.md` §Network — the question is part of the report when the
capture is empty.

## P12 — Expired artifacts (2026-11-23)

**Symptom:** the artifacts endpoint returned a 27-byte `404` for a two-day-old
pipeline.
**Gate:** phase 2 falls back to the job traces: `codequality` data lives in the
`check apk` trace as `generate_report` lines, and the byte-compare line lives
in the `fdroid build` trace.
