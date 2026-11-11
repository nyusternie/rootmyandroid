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
updated: 2026-11-11
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
~3 t/s sustained generation on this device class. The reason to pick
the 2507 over its sibling is instruction-following quality and the
context headroom, not speed.

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
