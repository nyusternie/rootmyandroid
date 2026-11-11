#!/system/bin/sh
# apps/rootzd/tools/llm-bench/bench-phase0.sh — Phase-0 backend/thread
# matrix for llama-bench on redfin (Pixel 5, Android 14), driven from
# /data/local/tmp/llama/ as the shell user.
#
# Toolchain provenance: llama-bench binary from the llama-bench-preview
# prerelease (llama-bench.yml, run 43057927216, 2026-11-11) — llama.cpp
# v0.9.0 (cd959bae), NDK 27.1.12297006, static, GGML_OPENMP=OFF.
# Model: Qwen2.5-0.5B-Instruct Q4_K_M, 491,400,032 B (size-verified on
# host and device 2026-11-11).
#
# Thermal policy (owner ruling 2026-11-11; aligned with the device's
# /vendor/etc/thermal_info_config.json, which puts MODERATE = 95.0 C and
# SHUTDOWN = 125.0 C on cpu-*-usr sensors):
#   - abort the benchmark at Thermal Status >= 2 (dumpsys thermalservice)
#   - hard-halt at >= 3 regardless of suite position
#   - cool to cpu-0-0-usr <= 50 C between runs (10-min bounded wait)
# toybox taskset takes HEX MASKS (no -c): 0-5=3f, 6-7=c0, 0-7=ff.

DIR=/data/local/tmp/llama
MODEL=$DIR/qwen2.5-0.5b-instruct-q4_k_m.gguf
BENCH=$DIR/llama-bench
OUT=$DIR/bench-phase0-$(date '+%Y%m%d-%H%M%S').log

thermal_status() {
  # mTemp= does not exist in this dumpsys build (grep count verified 0
  # on 2026-11-11); the per-sensor Thermal Status is mStatus= inside
  # Temperature{...} lines — take the max across all sensors.
  dumpsys thermalservice 2>/dev/null | grep 'Temperature{' | grep -o 'mStatus=[0-9]*' | cut -d= -f2 | sort -rn | head -1
}

cpu_temp() {
  for z in /sys/class/thermal/thermal_zone*; do
    if [ "$(cat "$z/type" 2>/dev/null)" = "cpu-0-0-usr" ]; then
      t=$(cat "$z/temp" 2>/dev/null)
      echo $((t / 1000))
      return
    fi
  done
  # Fallback: no thermal zones visible to this uid (observed on rooted
  # redfin 2026-11-11 — shell sees zero zones under /sys/class/thermal);
  # parse the HAL's view instead. Format (verified same day):
  #   Temperature{mValue=46.500004, mType=0, mName=cpu-0-0-usr, mStatus=0}
  v=$(dumpsys thermalservice 2>/dev/null | grep 'Temperature{' | grep 'mName=cpu-0-0-usr' | grep -o 'mValue=[0-9]*' | head -1 | cut -d= -f2)
  echo "${v:-999}"
}

guard() {
  s=$(thermal_status)
  if [ "${s:-0}" -ge 3 ]; then
    echo "HARD-HALT: Thermal Status $s (>=3)" | tee -a "$OUT"
    exit 3
  fi
  if [ "${s:-0}" -ge 2 ]; then
    echo "ABORT: Thermal Status $s (>=2)" | tee -a "$OUT"
    exit 2
  fi
}

cooldown() {
  i=0
  while [ "$i" -lt 20 ]; do
    t=$(cpu_temp)
    [ "${t:-999}" -le 50 ] && return 0
    echo "cooldown: cpu-0-0-usr ${t}C > 50C, waiting 30s ($((i + 1))/20)" | tee -a "$OUT"
    sleep 30
    guard
    i=$((i + 1))
  done
  echo "ABORT: cpu-0-0-usr did not reach <=50C within 10 min" | tee -a "$OUT"
  exit 3
}

run() {
  guard
  cooldown
  echo "" | tee -a "$OUT"
  echo "=== $1 (mask $2, -t $3) $(date '+%Y-%m-%d %H:%M:%S') ===" | tee -a "$OUT"
  echo "thermal before: status $(thermal_status), cpu-0-0-usr $(cpu_temp)C" | tee -a "$OUT"
  taskset "$2" "$BENCH" -m "$MODEL" -t "$3" -p 128 -n 64 -r 3 2>&1 | tee -a "$OUT"
  echo "thermal after: status $(thermal_status), cpu-0-0-usr $(cpu_temp)C" | tee -a "$OUT"
}

echo "bench-phase0 start $(date '+%Y-%m-%d %H:%M:%S') -> $OUT" | tee -a "$OUT"

run silver-6 3f 6
run gold-2  c0 2
run all-8   ff 8

echo "" | tee -a "$OUT"
echo "bench-phase0 done $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$OUT"
