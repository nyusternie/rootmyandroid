---
# src/content/models/qwen2-5-1-5b-instruct.md — model profile entry.
# Every number below is either (a) verified against the Hugging Face API
# on 2026-11-11 (repo files, params, context, license, downloads, byte
# size) or (b) measured on our own redfin (Pixel 5, Android 14) — the
# benchmark entries cite their raw log in this repository (AGENTS.md
# rule 3: nothing guessed).
name: Qwen2.5-1.5B-Instruct
family: Qwen2.5 (Alibaba)
description: >-
  The first model that clears our bar for sustained on-device agent duty —
  1.54B unique parameters, 1.04 GiB at Q4_K_M, Apache-2.0. Fit-tested and
  benchmarked on a rooted Pixel 5 (redfin, Android 14) with llama.cpp
  v0.9.0.
hfBase: Qwen/Qwen2.5-1.5B-Instruct
hfGguf: Qwen/Qwen2.5-1.5B-Instruct-GGUF
license: Apache-2.0
downloadsMonthly: 523012
paramsUnique: 1543714304
paramsGguf: 1777088000
contextTokens: 32768
contextGguf: 8192
quant: Q4_K_M
ggufFile: qwen2.5-1.5b-instruct-q4_k_m.gguf
ggufBytes: 1117320736
tier: 1–2 GiB
verified: 2026-11-11
updated: 2026-11-11
benchmarks:
  - date: 2026-11-11
    device: redfin (Pixel 5, Android 14)
    toolchain: >-
      llama.cpp v0.9.0 (commit cd959bae), NDK 27.1.12297006, static
      arm64-v8a, GGML_NATIVE=OFF, GGML_OPENMP=OFF — llama-bench binary
      from this repo's llama-bench-preview prerelease (run 43057927216)
    log: https://github.com/nyusternie/rootmyandroid/blob/master/apps/rootzd/tools/llm-bench/results/bench-phase1-20261111-115824.log
    cells:
      - name: fit-all-8
        mask: ff
        threads: 8
        tests:
          - { name: pp128, tps: 15.71, err: 0.05 }
          - { name: tg128, tps: 7.53, err: 0.01 }
    notes: >-
      Fit test: MemAvailable read 3,807,772 kB before the run and
      3,785,920 kB after (weights mmap'd and released around the bench
      process), i.e. roughly 3.6 GiB of headroom around a 1.04 GiB
      resident model. Thermal Status 0 and 46 °C throughout — abort
      policy never engaged. Harness:
      apps/rootzd/tools/llm-bench/bench-phase1.sh (abort at Thermal
      Status ≥ 2, hard-halt ≥ 3, inter-run cooldown to ≤ 50 °C).
  - date: 2026-11-11
    device: redfin (Pixel 5, Android 14)
    toolchain: >-
      llama.cpp v0.9.0 (commit cd959bae), NDK 27.1.12297006, static
      arm64-v8a, GGML_NATIVE=OFF, GGML_OPENMP=OFF — llama-bench binary
      from this repo's llama-bench-preview prerelease (run 43057927216)
    log: https://github.com/nyusternie/rootmyandroid/blob/master/apps/rootzd/tools/llm-bench/results/bench-soak-20261111-140338.log
    cells:
      - name: soak-all-8
        mask: ff
        threads: 8
        tests:
          - { name: pp128 (warm start), tps: 10.91, err: 0.00 }
          - { name: tg2048 (sustained), tps: 5.43, err: 0.00 }
    notes: >-
      Thermal soak: one sustained 2,048-token generation under 10-second
      telemetry (thermal status + per-core kHz, logged in the raw log).
      Max clocks until 114 s; throttle onset at 125 s (gold cluster
      steps down, status still 1); Thermal Status 2 at 228 s (silver
      clamped to 1,363,200 kHz, gold ~1.48/1.77 GHz); run finished at
      394 s. The 5.43 t/s whole-run average against the 7.53 t/s
      cool-burst above is a 28% thermal tax; the steady-state throttled
      rate is lower still. Entered warm at Status 1 (directly after the
      Phase-2 suite). Single repetition — 0.00 stddev means "not
      measured".
---

## What this model is

Qwen2.5-1.5B-Instruct is the second-smallest instruct model in Alibaba's
Qwen2.5 line — and the first rung on the ladder where instruction
following stops being a demo and starts being usable. It keeps the
permissive Apache-2.0 license and, like the 0.5B, ships an official GGUF
from the authors themselves.

It is the subject of our Phase 1 fit test: the first model we evaluated
not for "does it boot" but for "does it fit alongside everything else an
agent harness needs."

## Why two parameter counts

The base repository's safetensors total is **1,543,714,304** unique
weights; the shipped GGUF's metadata reports **1,777,088,000**, counting
the tied input/output embedding matrix twice. Same convention difference
as the 0.5B profile documents — both values are exact Hugging Face API reads from
the verification date.

## Context: read the GGUF, not the headline

As with the 0.5B: config.json advertises **32,768** tokens natively, but
the official GGUF ships `context_length: 8192` in its metadata, which is
what llama.cpp uses unless you pass `-c` explicitly. Budget the KV cache
for the context you actually allocate, not for the headline number.

## On-device agent suitability

Measured on redfin:

- **Generation at 7.5 t/s cool, 5.4 t/s sustained**: the burst figure
  is the deliberate-pacing tier (fine for an agent loop that spends most
  of its wall-clock time executing tool calls, slow for interactive
  chat); the sustained figure is the measured thermal-soak average below
  — plan duty cycles around 5.4 t/s, not 7.5.
- **Prompt processing at 15.7 t/s** is the real planning constraint — a
  2,000-token system prompt costs about two seconds of silence before the
  first token. Keep prompts tight or cache them (the GGUF context of
  8,192 makes `-c`-expanded KV budgets easy to stay inside).
- **Fit is comfortable**: ~3.6 GiB of headroom around the resident model
  on our 7.29 GiB device, leaving room for the runtime, the harness, and
  everyday apps.

This is the smallest model we would put on sustained agent duty on an
8 GB phone — everything below it is for routing and formatting, not for
following instructions.

## Reproduce these numbers

1. Binaries from this repo's `llama-bench-preview` prerelease (llama.cpp
   v0.9.0, commit-pinned and SHA-verified by
   `.github/workflows/llm-bench.yml`).
2. Push `llama-bench` and the GGUF (exact file above) to
   `/data/local/tmp/llama/` on the device.
3. Run `apps/rootzd/tools/llm-bench/bench-phase1.sh` — same CPU mask,
   thread count, thermal guard, and MemAvailable capture; diff the log
   against ours (linked above).

## Data provenance

Hugging Face API verification: 2026-11-11 (repos, parameter totals, context values,
license, monthly downloads, exact quant file bytes). Device measurements:
redfin (Pixel 5, Android 14), 2026-11-11, via the harness above. No
third-party phone specifications are used anywhere in this profile.
