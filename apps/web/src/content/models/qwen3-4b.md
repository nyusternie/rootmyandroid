---
name: Qwen3-4B
family: Qwen3
description: >-
  Qwen3-4B is the 4B-class upper bound of our on-device benchmark
  program: an official-GGUF model with a native 40,960-token context and
  tied embeddings, which on our Pixel 5 reference device fits and runs —
  but lands exactly on the device's thermal limit, losing a measurable
  share of its throughput as the suite warms up.
hfBase: Qwen/Qwen3-4B
hfGguf: Qwen/Qwen3-4B-GGUF
license: apache-2.0
downloadsMonthly: 717563
paramsUnique: 4022468096
paramsGguf: 4022468096
contextTokens: 40960
contextGguf: 40960
quant: Q4_K_M
ggufFile: Qwen3-4B-Q4_K_M.gguf
ggufBytes: 2497280256
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
            tps: 5.84
            err: 0.04
          - name: tg128
            tps: 3.44
            err: 0.06
    notes: >-
      Cool-device run: entered at Thermal Status 0 and ended at Status 1.
      This is the throughput a 4B delivers while the silicon is still
      cool — treat it as the ceiling, not the sustained rate.
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
            tps: 4.48
            err: 0.29
          - name: tg128
            tps: 3.01
            err: 0.13
    notes: >-
      Warm-device run: entered at Thermal Status 1 (prior suite load)
      and ended at Status 2 — the harness's cooldown gate then held the
      next cells until status cleared below 2 (owner-ruled abort policy
      working as designed). Same model, same flags, 23% less prompt
      throughput purely from thermal state.
---

## What this model is

Qwen3-4B is the smallest dense model in Alibaba's Qwen3 family that we
consider a candidate for on-device agent duty: 4.02B unique parameters,
a native 40,960-token context, an official GGUF repository, and an
Apache-2.0 license (no registration gate). It is the **upper bound of
our benchmark program** — the largest model class we test on the Pixel 5
reference device.

## Same parameter count everywhere — because the embeddings are tied

Unlike the Qwen2.5 models on this site, Qwen3-4B shows the **same**
total in both counts (4,022,468,096): its embeddings are tied in the
GGUF file itself, so there is no duplicate output tensor to double
count. When comparing across models, the safetensors (unique weights)
number is the apples-to-apples one.

## Context: 40,960 natively — but the KV cache has to fit too

The 40,960-token headline is real in both the config and the shipped
GGUF. The practical limit on an 8 GB phone is the KV cache: at this
architecture (36 layers, 8 KV heads, head_dim 128 — verified from the
config) the KV costs 147,456 bytes per token in f16:

| context | KV (f16) | KV (q8_0) | + 2.33 GiB weights fits on redfin? |
| ------- | -------: | --------: | ---------------------------------- |
| 8,192   | 1.12 GiB | 0.56 GiB  | yes — verified on-device           |
| 16,384  | 2.25 GiB | 1.12 GiB  | yes with q8 KV — verified on-device (2507 sibling) |
| 32,768  | 4.50 GiB | 2.25 GiB  | no                                 |

## On-device agent suitability

**Fits, but thermally bound.** On our Pixel 5 the cool-device ceiling is
5.84 t/s prompt / 3.44 t/s generation; by the time the device reaches
Thermal Status 1–2 the same cell returns 4.48 / 3.01. Sustained agent
loops (repeated tool-use turns) will spend most of their time warm, so
**plan around ~3 t/s generation, not ~3.4**. The 1.5B class
(~7.5 t/s cool) remains the comfort zone for background duty on this
hardware generation; the 4B class is for when its stronger reasoning
justifies the thermal tax — see the sibling
[Qwen3-4B-Instruct-2507 profile](/model/qwen3-4b-instruct-2507/) for the
262k-context variant's envelope results.

## Reproduce these numbers

1. Build the toolchain exactly as recorded: llama.cpp v0.9.0 commit
   `cd959ba`, static arm64-v8a NDK build (`GGML_NATIVE=OFF`,
   `GGML_OPENMP=OFF`), deployed to `/data/local/tmp/llama/`.
2. Download `Qwen3-4B-Q4_K_M.gguf` from the GGUF repo above (expect
   exactly 2,497,280,256 bytes) and push it to the same directory.
3. Run `llama-bench -m Qwen3-4B-Q4_K_M.gguf -p 128 -n 128 -r 3` under
   `taskset ff`.
4. Compare against the raw logs linked from the benchmark tables above,
   and note the thermal status at the start of your run before
   comparing.

## Data provenance

Metadata verified against the Hugging Face API on 2026-11-11 (repositories,
both parameter counts, config and GGUF context lengths, license, monthly
downloads on the GGUF repo, exact GGUF byte size). Benchmarks measured on
2026-11-11 on the Pixel 5 (redfin) reference device, Android 14; raw
llama-bench output is committed to the repository and linked from each
table. Thermal status figures are Android `dumpsys thermalservice` readings
taken by the benchmark harness (max across the device's 36 thermal
sensors).
