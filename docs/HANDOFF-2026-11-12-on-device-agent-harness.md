<!-- docs/HANDOFF-2026-11-12-on-device-agent-harness.md -->

# HANDOFF — on-device LLM agent harness (Lane B)

**To:** the incoming agent-harness team
**From:** the 2026-11-11/12 redfin harness workstream
**Status:** harness FUNCTIONAL and committed; agent *quality* is the
open problem and it is now MEASURED, not anecdotal. Everything below
has a committed log or a file path; where it does not, the word
PROPOSED or UNKNOWN is used deliberately.

---

## 0. TL;DR — the one result that matters

On redfin (Pixel 5, Android 14, Magisk-rooted) with
Qwen3-4B-Instruct-2507 Q4_K_M on llama-server (8 threads, ctx 4096):

> **Greedy decoding (temp 0) cannot run even a 5-question device
> audit, and NO driver-side mechanism we built could rescue it.
> Sampling at temp 0.6 + a repeat-guard completes the audit in 6–9
> turns — but still produced one false negative ("no root" on a
> rooted device).**

Treat every unsupported negative from an on-device agent as
"unknown". That is a measured deployment rule, not a style choice.

## 1. What exists and where

| piece | path | notes |
| --- | --- | --- |
| driver | `apps/rootzd/tools/agent-demo.mjs` | zero-dep Node ≥22 ESM script; ChatML loop over llama-server `/completion` |
| guard | inside the same file, `splitSegments/stripEnvAssignments/RULES/classify/decide` | MIRRORED 1:1 from `apps/rootz/app/src/main/java/com/rootmyandroid/rootz/CommandGuard.kt` — **change both or change neither**; empty approval stores ⇒ fail-closed (only SAFE executes) |
| run logs | `apps/rootzd/tools/results/agent-demo-*.log` | 7 committed logs (force-added over the `results/` ignore — same convention as llm-bench) |
| public numbers | `apps/web/src/content/models/qwen3-4b-instruct-2507.md` | 7 benchmark entries + deployment prose; built into `/model/qwen3-4b-instruct-2507/` |
| server on device | `/data/local/tmp/llama/llama-server` + `Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | started with `taskset ff ./llama-server -m … -t 8 -c 4096 --host 127.0.0.1 --port 8399` |
| host link | `adb forward tcp:8399 tcp:8399` | **the forward silently dies on adb reconnects** — first debug step, always |

Run it:

```bash
adb -s 0C151FDD400648 forward tcp:8399 tcp:8399
node apps/rootzd/tools/agent-demo.mjs \
  --turns 12 --temp 0.6 --mode loopguard
```

Flags: `--serial` (default redfin), `--url`, `--turns`, `--temp`
(default 0), `--mode loopguard|orchestrate|prune` (default loopguard).

## 2. The experiment ladder (what was tried, in order, all logged)

| # | change | result (log) |
| --- | --- | --- |
| 1 | free-form goal, temp 0 | off-goal drift; repeated turn 2 (`agent-demo-202611112331.log`) |
| 2 | numbered checklist + 4 explicit rules | WORSE: rigid 3-command cycle, turns 1/4/7·2/5/8·3/6/9 identical (`…2337.log`) |
| 3 | driver-side exact-repeat refusal (`executed` set) | 4/4 repeats refused, device safe, model NEVER changed behavior (`…2342.log`) |
| 4 | temp 0.6, same guard | audit COMPLETE and CORRECT in 6 turns — found Magisk `su` at `/product/bin/su` (`agent-demo-202611120026.log`) |
| 5 | temp 0.6 replication | completed in 9 turns but FALSE NEGATIVE: "root NOT present" on the same rooted phone (`agent-demo-202611120031.log`) |
| 6 | orchestrate mode @ temp 0 | 3-cycle survived 7 explicit driver nudges; model gave up, root "Unknown" (`agent-demo-202611121845.log`) |
| 7 | prune mode @ temp 0 | cycle BROKE (explored sys.root, security_patch, manufacturer, brand, codename) but never ran `getenforce`/`which su`; burned the 12-turn cap (`agent-demo-202611121851.log`) |

Interpretation, stated carefully because it is only 7 runs on 1
model/1 device: the loop is a property of greedy decoding on this
model, not of the prompt, and context-side interventions shift but do
not eliminate it. Sampling escapes it; sampling also reintroduces
variance. Neither result has been replicated on other models or
devices — do not generalize beyond what is logged.

## 3. Toybox traps the model hit (verify before "fixing" the model)

- `grep -E '\bsu\b' …` → rc=2 (toybox grep rejects GNU `\b`). The
  model retried the same class of command twice — stderr does NOT
  teach it in-context.
- `find /system/xbin /system/bin …` → rc=1 and STOPS at the first
  missing operand (`/system/xbin` does not exist on redfin), so the
  "search everything" pattern silently searches almost nothing.
- The actual `su` lives at `/product/bin/su` on this device.
- Correct recovery path (observed in run 4): `getenforce` for SELinux,
  `which su 2>/dev/null || echo not found` for root.

## 4. Operational rules now in force

1. **Thermal caps are REMOVED from `agent-demo.mjs` ONLY** (owner
   ruling 2026-11-11, verbatim: "THIS IS A TEST DEVICE / IF IT GETS
   DAMAGED WE WILL JUST REPLACE IT"). Status + CPU temp are still
   logged every turn and the transcript is written from a `finally`
   block so evidence survives a kill.
2. **`bench-phase*.mjs` / `bench-soak.mjs` KEEP their thermal gates.**
   Their published numbers were measured under that policy; running
   them uncapped produces numbers that are not comparable to the
   profile tables. Do not "harmonize" them without re-measuring.
3. The demo tool must stay zero-dependency and guard-mirrored; if you
   change `CommandGuard.kt` semantics, port the change here the same
   day (the file header says so — keep it true).

## 5. Open work (priority order, as of 2026-11-12)

1. **Lane A convergence (the owner's stated goal):** run this exact
   loop through the PRODUCTION E2E relay instead of local adb —
   i.e. the model's `cmd` becomes an `stdin` frame on the rootzd
   tunnel (`apps/rootzd/docs/e2e-protocol.md`; verified driver:
   `apps/rootzd/tools/e2e-probe.mjs`). NOT STARTED. Watch for: uid
   2000 (shell) vs uid 0 (root) tier differences in what the audit
   can see; the relay's 64 KiB frame cap; 10-min idle reap.
2. **Negative-verification harness:** when the agent answers "not
   found / absent / unknown", re-probe with a pinned canonical
   command set and mark the answer UNVERIFIED until it agrees. The
   false negative in run 5 is the motivating case.
3. **Never-fired path:** the guard's REFUSED verdict has never
   triggered in a live run (the model stayed read-only in all 7).
   Fail-closed is proven by construction + unit mirror, not by
   observation. If you need a live demo of a refusal, seed the
   checklist with a tempting-but-CAUTION item.
4. **Cross-model / cross-device replication** before any of the §2
   conclusions are quoted outside the 4B-2507/redfin context.
5. llama-server on-device has NO auto-restart; it wedged once during
   these runs (bound port, dead listener — see §1 forward note). A
   5-line watchdog would have saved 20 minutes.

## 6. What NOT to do (learned the expensive way)

- Do not conclude the harness is broken when the model loops —
  check `th N/temp` in the log and the guard verdicts first; in 5 of
  7 runs the harness was fine and the *decoding* was the defect.
- Do not re-run bench-phase* uncapped "to compare" — different
  thermal policy, different numbers, silently.
- Do not put credentials, account numbers, or relay internals in
  logs committed here (AGENTS.md rules 3a/11 apply to `results/`
  too — it is force-added INTO the public repo).
- Do not "fix" the false negative by prompt-engineering alone: run 2
  proved the model can recite 4 explicit rules and violate all 4.
  Verify in the driver.

— end of handoff. Questions: the 7 logs + the profile page are the
ground truth; this doc is the map, not the territory.
