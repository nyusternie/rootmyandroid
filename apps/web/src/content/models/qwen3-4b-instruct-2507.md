---
name: Qwen3-4B-Instruct-2507
family: Qwen3
description: >-
  Qwen3-4B-Instruct-2507 is the 262,144-token context refresh of the
  Qwen3 4B instruct line — the longest context on this site. Qwen ships
  NO official GGUF for it, so we benchmark bartowski's community quant,
  whose GGUF metadata preserves the full 262,144-token context; on our
  Pixel 5 the model plus a 16k q8 KV cache is the measured context
  ceiling.
hfBase: Qwen/Qwen3-4B-Instruct-2507
hfGguf: bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF
license: apache-2.0
downloadsMonthly: 103159
paramsUnique: 4022468096
paramsGguf: 4022468096
contextTokens: 262144
contextGguf: 262144
quant: Q4_K_M
ggufFile: Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf
ggufBytes: 2497280736
tier: 2–3 GiB
verified: 2026-11-11
updated: 2026-11-12
benchmarks:
  - date: 2026-11-11
    device: Pixel 5 (redfin), Android 14, 8 GB RAM
    toolchain: llama.cpp v0.9.0 (commit cd959ba), llama-bench, static arm64-v8a NDK build, CPU backend
    log: https://github.com/nyusternie/rootmyandroid/blob/master/apps/rootzd/tools/llm-bench/results/bench-phase2-20261111-132042.log
    cells:
      - name: fit-all-8
        mask: 'ff'
        threads: 8
        tests:
          - name: pp128
            tps: 5.18
            err: 0.00
          - name: tg128
            tps: 2.97
            err: 0.23
    notes: >-
      Entered at Thermal Status 1 (directly after the Qwen3-4B cell) and
      ended at Status 2 — the generation stddev of 0.23 reflects that
      mid-run thermal ramp.
  - date: 2026-11-11
    device: Pixel 5 (redfin), Android 14, 8 GB RAM
    toolchain: llama.cpp v0.9.0 (commit cd959ba), llama-bench, static arm64-v8a NDK build, CPU backend
    log: https://github.com/nyusternie/rootmyandroid/blob/master/apps/rootzd/tools/llm-bench/results/bench-phase2-20261111-133523.log
    cells:
      - name: fit-all-8
        mask: 'ff'
        threads: 8
        tests:
          - name: pp128
            tps: 5.20
            err: 0.03
          - name: tg128
            tps: 2.90
            err: 0.24
    notes: >-
      Independent re-run under the fixed harness (cooldown gate waited
      for status to clear below 2 before this cell): 5.20/2.90 against
      the first run's 5.18/2.97 — reproducible.
  - date: 2026-11-11
    device: Pixel 5 (redfin), Android 14, 8 GB RAM
    toolchain: llama.cpp v0.9.0 (commit cd959ba), llama-cli, static arm64-v8a NDK build, CPU backend
    log: https://github.com/nyusternie/rootmyandroid/blob/master/apps/rootzd/tools/llm-bench/results/bench-phase2-env3-20261111-141245.log
    cells:
      - name: env-8k-f16
        mask: 'ff'
        threads: 8
        tests:
          - name: prompt smoke @ 8,192 ctx (f16 KV)
            tps: 4.2
            err: 0.0
          - name: generation @ 8,192 ctx (f16 KV)
            tps: 2.9
            err: 0.0
      - name: env-16k-q8
        mask: 'ff'
        threads: 8
        tests:
          - name: prompt smoke @ 16,384 ctx (q8_0 KV)
            tps: 4.6
            err: 0.0
          - name: generation @ 16,384 ctx (q8_0 KV)
            tps: 3.2
            err: 0.0
    notes: >-
      Context-envelope ALLOCATION probes (llama-cli -c N, chat template,
      single turn, "what is 2 + 2?" answered correctly in both cells):
      the point of each cell is that the full KV cache + weights load
      and generate at all — single repetition, so 0.0 stddev means "not
      measured". 8,192 ctx with f16 KV (1.12 GiB) and 16,384 ctx with
      q8_0 KV (1.12 GiB) both fit; 32,768 does not (4.50/2.25 GiB KV
      arithmetic — see below).
  - date: 2026-11-11
    device: Pixel 5 (redfin), Android 14, 8 GB RAM
    toolchain: llama.cpp v0.9.0 (commit cd959ba), llama-cli, static arm64-v8a NDK build, CPU backend
    log: https://github.com/nyusternie/rootmyandroid/blob/master/apps/rootzd/tools/llm-bench/results/bench-phase3-20261111-181000.log
    cells:
      - name: agent-smoke-t1-json-answer
        mask: 'ff'
        threads: 8
        tests:
          - { name: generation (greedy, -n 256), tps: 2.2, err: 0.0 }
      - name: agent-smoke-t2-tool-call
        mask: 'ff'
        threads: 8
        tests:
          - { name: generation (greedy, -n 256), tps: 2.3, err: 0.0 }
      - name: agent-smoke-t3-plan-then-react
        mask: 'ff'
        threads: 8
        tests:
          - { name: generation (greedy, -n 256), tps: 1.3, err: 0.0 }
    notes: >-
      Phase-3 agent-quality smoke (harness bench-phase3.sh, scorer
      score-phase3.py — both committed alongside the log): 3/3 PASS —
      the only tier that passed t3. t1 PASS: valid JSON {"answer":
      "Paris", "confidence": 1.0}. t2 PASS: valid {"tool": "shell",
      "cmd": "getprop ro.build.version.release"} — a real, read-only
      Android command. t3 PASS: given a transcript whose tool already
      returned uid=0(root), it did NOT re-issue the same command (both
      smaller models did) and continued investigating: {"tool": "shell",
      "cmd": "ls /system/app/Superuser.apk"} — reacting to tool results
      is the core agent-loop capability this site benchmarks for. Greedy
      (--temp 0), single repetition per cell (0.0 stddev = "not
      measured"). Generation t/s here is not comparable to the
      llama-bench fit numbers — llama-cli adds chat-template/sampling
      scaffolding and these cells ran back-to-back.
  - date: 2026-11-11
    device: Pixel 5 (redfin), Android 14, 8 GB RAM
    toolchain: llama-server v0.9.0 (commit cd959ba) via agent-demo.mjs (JSON action loop, CommandGuard mirror, empty approval stores)
    log: https://github.com/nyusternie/rootmyandroid/blob/master/apps/rootzd/tools/results/agent-demo-202611112331.log
    cells:
      - name: audit-t0-freeform
        mask: 'ff'
        threads: 8
        tests:
          - { name: per-turn generation (mean of 8 turns), tps: 1.79, err: 0.35 }
    notes: >-
      Open-ended 5-point device audit at greedy decoding (temp 0). The
      model never repeated a command but drifted off-goal from turn 4
      (unrequested patch level, codename, SDK) and exhausted the 8-turn
      cap without answering the last three checklist items.
  - date: 2026-11-11
    device: Pixel 5 (redfin), Android 14, 8 GB RAM
    toolchain: llama-server v0.9.0 (commit cd959ba) via agent-demo.mjs (same loop, checklist prompt)
    log: https://github.com/nyusternie/rootmyandroid/blob/master/apps/rootzd/tools/results/agent-demo-202611112337.log
    cells:
      - name: audit-t0-checklist
        mask: 'ff'
        threads: 8
        tests:
          - { name: per-turn generation (mean of 9 turns), tps: 0.92, err: 0.10 }
    notes: >-
      Same audit with a numbered-checklist prompt (order, no-repeat,
      empty-result rules) at temp 0: WORSE — a rigid 3-command cycle
      (turns 1/6/9, 2/4/7, 3/5/8 identical), all four stated rules
      ignored. The owner-policy thermal abort (Thermal Status 2) ended
      the run at turn 10. A stalled sub-goal (empty selinux.status
      output) is a deterministic attractor under greedy decoding that
      prompt text cannot break.
  - date: 2026-11-11
    device: Pixel 5 (redfin), Android 14, 8 GB RAM
    toolchain: llama-server v0.9.0 (commit cd959ba) via agent-demo.mjs (driver-side loop-guard added)
    log: https://github.com/nyusternie/rootmyandroid/blob/master/apps/rootzd/tools/results/agent-demo-202611112342.log
    cells:
      - name: audit-t0-loopguard
        mask: 'ff'
        threads: 8
        tests:
          - { name: per-turn generation (mean of 7 turns), tps: 1.40, err: 0.44 }
    notes: >-
      Driver-side repeated-action detection: an exact repeat of an
      already-EXECUTED command is refused (nothing ran twice, 4/4
      caught) and fed back as "pick a DIFFERENT command". The guard
      fully protected the device but the model did not change behavior
      on the feedback at temp 0; thermal abort at turn 8. Detection
      protects the device — it cannot unstick greedy decoding.
  - date: 2026-11-12
    device: Pixel 5 (redfin), Android 14, 8 GB RAM
    toolchain: llama-server v0.9.0 (commit cd959ba) via agent-demo.mjs (loop-guard, temp 0.6, thermal caps removed by owner ruling)
    log: https://github.com/nyusternie/rootmyandroid/blob/master/apps/rootzd/tools/results/agent-demo-202611120026.log
    cells:
      - name: audit-t06-loopguard
        mask: 'ff'
        threads: 8
        tests:
          - { name: per-turn generation (mean of 6 turns), tps: 1.82, err: 0.79 }
    notes: >-
      Sampling at temp 0.6 (everything else identical) broke the
      attractor: audit COMPLETE in 6 turns. The model recovered from an
      empty `getprop selinux.status` on its own, ran `getenforce`
      (Enforcing), then `which su 2>/dev/null || echo not found` (the
      guard mirror correctly split the `||` pipeline; both halves
      SAFE), and reported Pixel 5 / Android 14 / Enforcing / root
      present at /product/bin/su — CORRECT (Magisk, SELinux context
      u:r:magisk:s0 verified 2026-11-10).
  - date: 2026-11-12
    device: Pixel 5 (redfin), Android 14, 8 GB RAM
    toolchain: llama-server v0.9.0 (commit cd959ba) via agent-demo.mjs (loop-guard, temp 0.6, replication)
    log: https://github.com/nyusternie/rootmyandroid/blob/master/apps/rootzd/tools/results/agent-demo-202611120031.log
    cells:
      - name: audit-t06-loopguard-repl
        mask: 'ff'
        threads: 8
        tests:
          - { name: per-turn generation (mean of 9 turns), tps: 2.19, err: 0.37 }
    notes: >-
      Replication at temp 0.6: completed in 9 turns but concluded
      "root NOT present" — a FALSE NEGATIVE on the same rooted device.
      Measured causes: toybox `grep -E` rejects GNU \b word-boundaries
      (rc=2, tried twice — the stderr did not teach it), toybox `find`
      exits rc=1 without searching further when its first path operand
      is missing (/system/xbin absent on this device), and the model
      never ran `which su` or checked /product/bin. Deployment rule:
      treat every unsupported negative from an on-device agent as
      "unknown", or pin the search space in the harness.

---

## What this model is

Qwen3-4B-Instruct-2507 is the 2507 refresh of Qwen's 4B instruct line:
same 4.02B-parameter architecture as Qwen3-4B, retrained for stronger
instruction following, with the context window extended to **262,144
tokens — the longest of any model profiled on this site**.

**There is no official GGUF.** Qwen's Hugging Face organization ships no
GGUF repository for this model (the API id returns an authorization
error, not files). We benchmark
[bartowski's community quant](https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF),
the standard community source; its GGUF metadata preserves the full
262,144-token context (`gguf.context_length`, verified 2026-11-11). The
monthly-downloads figure above is for that quant repository; the base
model repository separately reports 2,576,505 monthly downloads.

## Context: the 262k headline, the 16k on-device reality

The KV-cache arithmetic for this architecture (36 layers, 8 KV heads,
head_dim 128 — verified from the config) at 147,456 bytes per token in
f16, plus 2.33 GiB of weights, on a device showing ~4 GB of available
RAM:

| context | KV (f16) | KV (q8_0) | fits on redfin? |
| ------- | -------: | --------: | --------------- |
| 8,192   | 1.12 GiB | 0.56 GiB  | yes — measured (env-8k-f16) |
| 16,384  | 2.25 GiB | 1.12 GiB  | yes with q8 KV — measured (env-16k-q8) |
| 32,768  | 4.50 GiB | 2.25 GiB  | no (arithmetic; not attempted) |
| 262,144 | 36.0 GiB | 18.0 GiB  | nowhere close — the headline needs server-class RAM |

**16,384 tokens with a q8 KV cache is the measured envelope** — roughly
12,000 words of working context, ample for agent loops that carry tool
output, plans, and a few files. Long-context prefill is expensive at
this speed class (prompt processing runs at ~5 t/s), so harnesses should
keep prompts tight rather than re-sending history.

## On-device agent suitability

Same thermal profile as [Qwen3-4B](/model/qwen3-4b/): plan around
~3 t/s sustained generation on this device class. Capability is
measured, not assumed: it scored 3/3 on the 2026-11-11 agent-quality
smoke below — including the only pass at reacting to a tool result
instead of re-issuing the same command. The reason to pick
the 2507 over its sibling is instruction-following quality and the
context headroom, not speed.

**Agent duty, measured end-to-end (2026-11-12, five runs in the last
benchmark entries above):** at greedy decoding this model cannot run an
open-ended audit loop — it drifts off-goal, then locks into a
deterministic 3-command cycle that neither a checklist prompt nor
driver-side refusals-with-feedback can break. At temp 0.6 with a
driver-side repeat guard it completed a 5-point device audit in 6–9
turns at ~1.8–2.2 t/s, correctly identifying a Magisk root in one run
and falsely denying it in the next. Ship it at temp ≥ 0.5, behind a
repeat guard, and verify every negative it reports.

## Reproduce these numbers

1. Build the toolchain exactly as recorded: llama.cpp v0.9.0 commit
   `cd959ba`, static arm64-v8a NDK build (`GGML_NATIVE=OFF`,
   `GGML_OPENMP=OFF`), deployed to `/data/local/tmp/llama/`.
2. Download `Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf` from the quant
   repo above (expect exactly 2,497,280,736 bytes) and push it to the
   same directory.
3. Fit test: `llama-bench -m <file> -p 128 -n 128 -r 3` under
   `taskset ff`.
4. Envelope probes: `llama-cli -m <file> -c 8192 -st -t 8 -ctk f16 -ctv
   f16 -p "You are a helpful assistant. Answer in one short sentence:
   what is 2 + 2?" -n 32` and the same with `-c 16384 -ctk q8_0 -ctv
   q8_0`. (This v0.9.0 llama-cli has no `--no-cnv` flag — conversation
   mode is the default and `-st` selects a single turn.)
5. Compare against the raw logs linked from the benchmark tables above.

## Data provenance

Metadata verified against the Hugging Face API on 2026-11-11 (base
repository, quant repository, both parameter counts, config and GGUF
context lengths, license, monthly downloads, exact GGUF byte size).
Benchmarks measured on 2026-11-11 on the Pixel 5 (redfin) reference
device, Android 14; raw output is committed to the repository and linked
from each table. Thermal status figures are Android `dumpsys
thermalservice` readings taken by the benchmark harness (max across the
device's 36 thermal sensors).
