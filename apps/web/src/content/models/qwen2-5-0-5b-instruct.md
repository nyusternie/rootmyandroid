---
# src/content/models/qwen2-5-0-5b-instruct.md — model profile entry.
# Every number below is either (a) verified against the Hugging Face API
# on 2026-11-11 (repo files, params, context, license, downloads, byte
# size) or (b) measured on our own redfin (Pixel 5, Android 14) — the
# benchmark entries cite their raw log in this repository (AGENTS.md
# rule 3: nothing guessed).
name: Qwen2.5-0.5B-Instruct
family: Qwen2.5 (Alibaba)
description: >-
  The smallest instruct-tuned Qwen2.5 model — 494M unique parameters,
  0.46 GiB at Q4_K_M, Apache-2.0, and the first model we benchmarked
  on-device. Measured on a rooted Pixel 5 (redfin, Android 14) with
  llama.cpp v0.9.0.
hfBase: Qwen/Qwen2.5-0.5B-Instruct
hfGguf: Qwen/Qwen2.5-0.5B-Instruct-GGUF
license: Apache-2.0
downloadsMonthly: 453903
paramsUnique: 494032768
paramsGguf: 630167424
contextTokens: 32768
contextGguf: 8192
quant: Q4_K_M
ggufFile: qwen2.5-0.5b-instruct-q4_k_m.gguf
ggufBytes: 491400032
tier: Fits in ~1 GiB
verified: 2026-11-11
updated: 2026-11-11
benchmarks:
  - date: 2026-11-11
    device: redfin (Pixel 5, Android 14)
    toolchain: >-
      llama.cpp v0.9.0 (commit cd959bae), NDK 27.1.12297006, static
      arm64-v8a, GGML_NATIVE=OFF, GGML_OPENMP=OFF — llama-bench binary
      from this repo's llama-bench-preview prerelease (run 43057927216)
    log: https://github.com/nyusternie/rootmyandroid/blob/master/apps/rootzd/tools/llm-bench/results/bench-phase0-20261111-115102.log
    cells:
      - name: silver-6
        mask: '3f'
        threads: 6
        tests:
          - { name: pp128, tps: 20.43, err: 0.03 }
          - { name: tg64, tps: 12.08, err: 0.14 }
      - name: gold-2
        mask: c0
        threads: 2
        tests:
          - { name: pp128, tps: 27.57, err: 0.14 }
          - { name: tg64, tps: 19.87, err: 0.01 }
      - name: all-8
        mask: ff
        threads: 8
        tests:
          - { name: pp128, tps: 47.72, err: 0.05 }
          - { name: tg64, tps: 20.47, err: 0.13 }
    notes: >-
      Two big cores outperform six little cores on both prompt processing
      and generation; generation saturates near 20 t/s regardless of core
      count (memory-bandwidth-bound). Flat 46 °C throughout — the thermal
      abort policy never engaged. Ran under a harness with abort at
      Thermal Status ≥ 2 and inter-run cooldown to ≤ 50 °C
      (apps/rootzd/tools/llm-bench/bench-phase0.sh).
  - date: 2026-11-11
    device: Pixel 5 (redfin), Android 14, 8 GB RAM
    toolchain: llama.cpp v0.9.0 (commit cd959ba), llama-cli, static arm64-v8a NDK build, CPU backend
    log: https://github.com/nyusternie/rootmyandroid/blob/master/apps/rootzd/tools/llm-bench/results/bench-phase3-20261111-181000.log
    cells:
      - name: agent-smoke-t1-json-answer
        mask: 'ff'
        threads: 8
        tests:
          - { name: generation (greedy, -n 256), tps: 11.0, err: 0.0 }
      - name: agent-smoke-t2-tool-call
        mask: 'ff'
        threads: 8
        tests:
          - { name: generation (greedy, -n 256), tps: 9.9, err: 0.0 }
      - name: agent-smoke-t3-plan-then-react
        mask: 'ff'
        threads: 8
        tests:
          - { name: generation (greedy, -n 256), tps: 10.1, err: 0.0 }
    notes: >-
      Phase-3 agent-quality smoke (harness bench-phase3.sh, scorer
      score-phase3.py — both committed alongside the log): 2/3 PASS. t1
      PASS: valid JSON {"answer": "Paris", "confidence": 1}. t2 PASS on
      FORMAT ONLY: the JSON parses with tool="shell", but the emitted
      cmd was "system info" — a plausible-looking non-command that would
      fail at exec time. t3 FAIL: given a transcript whose tool already
      returned uid=0(root), it re-issued the exact earlier action
      ("id") instead of reacting to the result — context-blindness an
      agent-loop harness must guard against itself at this tier. Greedy
      (--temp 0), single repetition per cell (0.0 stddev = "not
      measured"). Generation t/s here is not comparable to the
      llama-bench fit numbers — llama-cli adds chat-template/sampling
      scaffolding.

---

## What this model is

Qwen2.5-0.5B-Instruct is the smallest instruct-tuned member of Alibaba's
Qwen2.5 family. It is an unremarkable model in capability and a remarkable
one in footprint: at 0.46 GiB it fits in the free RAM of almost any phone
still in service, under the permissive Apache-2.0 license, with the
upstream authors publishing the GGUF themselves.

It is the first model we put through our own on-device benchmark harness
(Phase 0), so it is also the calibration point for every other profile on
this site.

## Why two parameter counts

The base repository's safetensors total is **494,032,768** — the unique
weights on disk. The shipped GGUF's own metadata reports **630,167,424**:
GGUF counts every tensor *including* the output projection, which on this
model is tied to the input embedding matrix (the same weights stored
twice in the accounting, once in memory). Both numbers are exact, both
come from the Hugging Face API on the verification date, and the
difference is convention, not error.

## Context: read the GGUF, not the headline

The base config.json advertises a native context of **32,768** tokens.
The official GGUF, however, ships with `context_length` set to **8,192**
in its metadata — the value llama.cpp actually defaults to. Longer
sessions need an explicit `-c 32768` at load time. (Verified from the
GGUF repo metadata 2026-11-11; the same family is inconsistent here —
Qwen2.5-3B's GGUF matches its config at 32,768, while Qwen2.5-7B's GGUF
carries the YaRN-extended 131,072.)

## On-device agent suitability

Measured on redfin, this model is a fast, shallow thinker. The 2026-11-11
agent-quality smoke below puts numbers on that: 2/3 — it obeys JSON
formatting but invents plausible-looking non-commands and re-issues
the same tool call in the face of its own tool result:

- **Prompt processing** (47.7 t/s on all eight cores) is cheap enough for
  high-chatter loops — routing, classification, extraction, templating.
- **Generation** (~20 t/s) is bandwidth-bound; more cores do not help
  beyond the two big ones.
- Reasoning depth is the expected limit of half a billion parameters. For
  our agent harness this is the dispatch-and-format candidate, not the
  planner.

Two big cores beat six little ones on every test — a measured result that
contradicts the intuitive "throw all the little cores at it" strategy for
this silicon.

## Reproduce these numbers

1. Build or download the benchmark binaries: this repo's
   `llama-bench-preview` prerelease (built on our CI runner from llama.cpp
   v0.9.0, commit-pinned and SHA-verified by
   `.github/workflows/llm-bench.yml`).
2. Push `llama-bench` and the GGUF (exact file in the table above) to
   `/data/local/tmp/llama/` on the device.
3. Run `apps/rootzd/tools/llm-bench/bench-phase0.sh` — it applies the
   same CPU masks, thread counts, and thermal guard policy, and writes a
   log you can diff against ours (linked with the benchmark entry above).

## Data provenance

Hugging Face API verification: 2026-11-11 (repos, parameter totals, context values,
license, monthly downloads, exact quant file bytes). Device measurements:
redfin (Pixel 5, Android 14), 2026-11-11, via the harness above. No
third-party phone specifications are used anywhere in this profile.
