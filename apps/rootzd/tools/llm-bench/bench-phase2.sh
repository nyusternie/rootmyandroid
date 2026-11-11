#!/system/bin/sh
# apps/rootzd/tools/llm-bench/bench-phase2.sh — Phase 2 of the on-device
# LLM benchmark program (owner-ruled ordering: Phase 0 backend/threads
# matrix with the 0.5B, Phase 1 fit test with the 1.5B, Phase 2
# upper-bound fit + context envelope with the 4B class, then the thermal
# soak).
#
# Two models (both verified against the Hugging Face API 2026-11-11,
# byte-gated before the device push by /tmp/phase2-fetch-push.sh):
#   A) Qwen/Qwen3-4B-GGUF — Qwen3-4B-Q4_K_M.gguf, 2,497,280,256 B
#      (official GGUF; native ctx 40,960; Apache-2.0)
#   B) bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF —
#      Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf, 2,497,280,736 B
#      (community quant — NO official GGUF exists for the 2507 refresh;
#      native ctx 262,144, preserved in the GGUF metadata)
#
# Phase-2 questions:
#   1) Does a 2.33 GiB 4B Q4_K_M fit and run on redfin (7.29 GiB RAM)?
#   2) How much context fits alongside it? KV arithmetic from the
#      VERIFIED config.json (36 layers, 8 KV heads, head_dim 128):
#        KV/token f16 = 36*8*128*2*2 = 147,456 B
#        8,192  ctx -> 1.12 GiB (f16) / 0.56 GiB (q8)
#        16,384 ctx -> 2.25 GiB (f16) / 1.12 GiB (q8)
#        32,768 ctx -> 4.50 GiB (f16) / 2.25 GiB (q8)
#      With 2.33 GiB weights + llama.cpp runtime on a device that shows
#      ~3.8 GiB MemAvailable: 16k only fits with q8 KV; 32k+ does not
#      fit at all. Cells are chosen accordingly:
#        env-8k-f16  : llama-cli -c 8192  (f16 KV) — allocation probe
#        env-16k-q8  : llama-cli -c 16384 (q8 KV)  — allocation probe
#      (llama-bench has no -c flag; probes measure FIT — whether the
#      full KV allocates and the model generates — not prefill depth.)
#
# Thermal policy (owner ruling, same as Phases 0-1):
#   - ABORT any run at Thermal Status >= 2
#   - HALT (device-level stop) at >= 3 regardless of suite position
#   - cool to cpu-0-0-usr <= 50C between runs
# Device-probe notes (measured on redfin 2026-11-11, carried forward):
#   - /sys/class/thermal is not readable as the shell user -> cpu temp
#     comes from `dumpsys thermalservice` (mName=cpu-0-0-usr line)
#   - `mTemp=` does not exist in this build's dumpsys -> thermal status
#     is the max mStatus= across Temperature{...} lines
#
# Runs on-device from /data/local/tmp/llama as the shell user:
#   adb push bench-phase2.sh /data/local/tmp/llama/
#   adb shell 'cd /data/local/tmp/llama && sh bench-phase2.sh 2>&1 | tee bench-phase2-$(date +%Y%m%d-%H%M%S).log'
# Optional first argument: `envelope-only` skips the A/B fit cells
# (e.g. to re-run just the section-C probes).

set -u
cd /data/local/tmp/llama
BENCH=./llama-bench
LOG_TAG="phase2 $(date -u +%Y-%m-%dT%H:%M:%SZ)"

say() { echo "[$LOG_TAG] $*"; }

memavail_kb() {
  awk '/^MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null
}

cpu_temp() {
  t=$(cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | sort -rn | head -1)
  if [ -n "$t" ]; then echo "$t"; return; fi
  dumpsys thermalservice 2>/dev/null \
    | grep -o 'Temperature{mValue=[0-9.]*, mType=0, mName=cpu-0-0-usr' \
    | grep -o '[0-9.]*' | head -1
}

thermal_status() {
  dumpsys thermalservice 2>/dev/null | grep 'Temperature{' \
    | grep -o 'mStatus=[0-9]' | grep -o '[0-9]' | sort -rn | head -1
}

guard() {
  s=$(thermal_status)
  s=${s:-0}
  if [ "$s" -ge 3 ]; then
    say "HALT: Thermal Status $s (>= 3) — stopping suite immediately"
    exit 3
  fi
  if [ "$s" -ge 2 ]; then
    say "ABORT: Thermal Status $s (>= 2) — skipping run, cooling down"
    return 1
  fi
  return 0
}

cooldown() {
  i=0
  while [ "$i" -lt 20 ]; do
    t=$(cpu_temp)
    t=${t:-0}
    case "$t" in
      ''|*[!0-9.]*) t=0 ;;
    esac
    t_int=${t%.*}
    t_int=${t_int:-0}
    s=$(thermal_status)
    s=${s:-9}
    # Cooldown must wait for BOTH gates: the temperature target AND the
    # thermal STATUS clearing below 2 — otherwise a status-2 abort would
    # immediately re-run at status 2 (observed 2026-11-11: env cells ran
    # at status=2 because cpu-0-0-usr read 46.5C while a DIFFERENT
    # sensor drove the status; fixed same day).
    if [ "$t_int" -le 50 ] && [ "$s" -lt 2 ]; then
      say "cooldown: cpu temp ${t}C <= 50C and status $s < 2 — proceeding"
      return 0
    fi
    say "cooldown: cpu temp ${t}C, status $s — waiting 30s ($((i+1))/20)"
    sleep 30
    i=$((i+1))
  done
  say "ABORT: cooldown timed out after 10 minutes"
  return 1
}

# run_cell <label> <binary> <args...>
run_cell() {
  label="$1"; bin="$2"; shift 2
  say "MemAvailable before $label: $(memavail_kb) kB"
  guard || { cooldown || exit 1; }
  say "RUN $label ($bin $*) — thermal: status=$(thermal_status) cpu=$(cpu_temp)C"
  taskset ff "$bin" "$@" 2>&1
  rc=$?
  say "END $label rc=$rc — thermal: status=$(thermal_status) cpu=$(cpu_temp)C"
  say "MemAvailable after $label: $(memavail_kb) kB"
  return $rc
}

MODEL_A="Qwen3-4B-Q4_K_M.gguf"
MODEL_B="Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf"

say "=== Phase 2 — 4B upper-bound fit + context envelope on redfin ==="
say "device: $(getprop ro.product.model) / $(getprop ro.build.version.release) / $(getprop ro.product.device)"
ls -la "$MODEL_A" "$MODEL_B" 2>&1

if [ "${1:-all}" = "all" ]; then
  say "--- A) Qwen3-4B Q4_K_M fit test ---"
  run_cell "fit-all-8" "$BENCH" -m "$MODEL_A" -p 128 -n 128 -r 3

  cooldown || exit 1

  say "--- B) Qwen3-4B-Instruct-2507 Q4_K_M fit test ---"
  run_cell "fit-all-8" "$BENCH" -m "$MODEL_B" -p 128 -n 128 -r 3

  cooldown || exit 1
fi

# Envelope probes use llama-cli, not llama-bench: llama-bench has NO
# context-size flag (ctx is derived from test sizes — a full 8k prefill
# would cost ~23 min at the measured pp of ~5.8 t/s), while `llama-cli
# -c N` allocates the full KV up front and answers the FIT question in
# about a minute. (Flag error observed 2026-11-11: `-c 8192` made
# llama-bench print its usage and exit 1.)
say "--- C) 2507 context envelope: 8k f16 KV ---"
# flag note: this v0.9.0 llama-cli has NO --no-cnv flag (either
# spelling) — conversation mode is the default and -st (single-turn)
# is the one-shot completion mode (help text verified on-device
# 2026-11-11).
run_cell "env-8k-f16" ./llama-cli -m "$MODEL_B" -c 8192 -st -t 8 \
  -ctk f16 -ctv f16 \
  -p "You are a helpful assistant. Answer in one short sentence: what is 2 + 2?" \
  -n 32

cooldown || exit 1

say "--- C) 2507 context envelope: 16k q8 KV ---"
run_cell "env-16k-q8" ./llama-cli -m "$MODEL_B" -c 16384 -st -t 8 \
  -ctk q8_0 -ctv q8_0 \
  -p "You are a helpful assistant. Answer in one short sentence: what is 2 + 2?" \
  -n 32

say "=== Phase 2 suite finished ==="
