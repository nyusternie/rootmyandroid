# Agent violation log

One entry per incident. Fields: what was claimed, what was true, which gate
would have caught it, which gate was added. The metric is **zero repeat
violations of a gated class** — not zero mistakes overall. Rules live in
`AGENTS.md` rule 13.

---

## 2026-11-21 — community reviews done to the wrong standard

- **Claimed:** the three posted reviews (Vynody, OpenInvest, CheapCheap) were
  complete F-Droid tester reports.
- **True:** wrong review pool (`New App` label with zero notes instead of
  `review-requested` with fewest non-maintainer notes), no network capture on
  `INTERNET` apps, freeform prose instead of the official template. Caught by
  the owner against the Sidecoin precedent.
- **Gate that would have caught it:** read the published tester procedure
  before reviewing, and check the pool definition.
- **Gate added:** `.agents/skills/fdroid-review/SKILL.md` (procedure, PCAPdroid
  steps, official template) + the three non-negotiable rules in `AGENTS.md`.
  All three reviews were overwritten in place (same note ids).

## 2026-11-21 — release 26.11.27 shipped a recipe change with no matching CI change

- **Claimed:** switching the recipe to JDK 21 was enough to reproduce the
  reference APK.
- **True:** the recipe's `jvmToolchain` sed also had to run in our own CI; the
  transform cache key baked into `libappmodules.so` differed
  (`transforms/23ffe694…` vs `transforms/7db65e98…`) and the byte comparison
  failed. One release was wasted.
- **Gate that would have caught it:** build locally with the exact recipe
  before tagging.
- **Gate added:** `AGENTS.md` rule 13f (one semantic change per recipe commit)
  and the "prove before tagging" step in the round-2 handoff.

## 2026-11-23 — pushed a `scanignore` deletion on an inference (pipeline 3101366239)

- **Claimed:** `- .vendor` and `- apps/desktop` are dead entries; deleting them
  is a no-op `[no evidence]`.
- **True:** `fdroidserver` logs `INFO: Ignoring <type> at <path>` **when a
  scanignore entry matches**; without the entries the same paths log
  `ERROR: Found gzip file archive at .vendor/hermes-compiler-260318099.0.4.tgz`
  and `ERROR: Found dependency file without lock at apps/desktop/src-tauri/Cargo.toml`.
  Pipeline 3101366239 failed at `fdroid build`. Reproduced locally after the
  fact: `ERROR:` count 0 with the entries, 2 without; `fdroid scanner -e`
  exits 0 in both cases.
- **Gate that would have caught it:** run `fdroid scanner` locally against the
  edited recipe before the push — the test existed and cost minutes.
- **Gate added:** `AGENTS.md` rules 13a (byte-keyed preflight, `ERROR:` count
  is the gate because `$?` lies), 13b (no hand-made API commits), 13c
  (evidence token for claims of effect), 13d (`confirms` banned in plans),
  13e (revert-first on red).

## 2026-11-23 — MR description PUT sent a literal @path string (fixed within 18 s)

- **Claimed (acted as if):** `glab api -f description=@file` reads the file.
- **True:** the `@file` expansion belongs to `-F/--field`; `-f/--raw-field`
  sent the LITERAL string `@/Workspace/hos/.../mr-description.md` as the MR
  description. The post-write verification grep caught it on the immediate
  re-fetch; the correct `-F` PUT restored the full text 18 seconds later.
  No pipeline, code, or recipe was affected; the MR was publicly wrong for
  those 18 seconds.
- **Gate that would have caught it:** the post-write verify did — read-back
  after EVERY remote write, not just pushes. Keep that as standing practice.
- **Gate added:** rule 13h (below) — remote writes are verified by read-back
  in the same command block; `glab` field flags: `-F` reads `@file`,
  `-f` does not.
