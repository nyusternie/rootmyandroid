#!/system/bin/sh
# apps/rootzd/tools/llm-bench/bench-phase1.sh — Phase-1 FIT test on
# redfin (Pixel 5, Android 14): does the 1-2 GiB catalog tier run with
# comfortable headroom, and at what speed?
#
# Model: Qwen2.5-1.5B-Instruct Q4_K_M, 1,117,320,736 B (size-verified on
# host and device 2026-11-11). Toolchain: same llama-bench-preview build
# as Phase 0 (llama.cpp v0.9.0 cd959ba, static, GGML_OPENMP=OFF).
#
# Fit evidence recorded: MemAvailable before the run and immediately
# after (model resident + KV cache), the pp/tg table, and the thermal
# readings. Thermal policy identical to Phase 0 (owner ruling 2026-11-11):
# abort at Thermal Status >= 2, hard-halt at >= 3, cool to <= 50 C
# between runs. toybox taskset hex masks: 0-7=ff.

DIR=/data/local/tmp/llama
MODEL=$DIR/qwen2.5-1.5b-instruct-q4_k_m.gguf
BENCH=$DIR/llama-bench
OUT=$DIR/bench-phase1-$(date '+%Y%m%d-%H%M%S').log

mem_avail() { grep 'MemAvailable' /proc/meminfo | tr -s ' ' | cut -d' ' -f2; }

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
    s=$(thermal_status)
    s=${s:-9}
    t_int=${t%.*}
    t_int=${t_int:-999}
    # Both gates: temp <= 50C AND status < 2 (fixed 2026-11-11 — the
    # Phase-2 run showed a temperature-only gate re-running at status 2
    # when a different sensor drives the status).
    [ "$t_int" -le 50 ] && [ "$s" -lt 2 ] && return 0
    echo "cooldown: cpu-0-0-usr ${t}C / status ${s} — waiting 30s ($((i + 1))/20)" | tee -a "$OUT"
    sleep 30
    guard
    i=$((i + 1))
  done
  echo "ABORT: cpu-0-0-usr did not reach <=50C within 10 min" | tee -a "$OUT"
  exit 3
}

echo "bench-phase1 start $(date '+%Y-%m-%d %H:%M:%S') -> $OUT" | tee -a "$OUT"
echo "MemAvailable before: $(mem_avail) kB" | tee -a "$OUT"

guard
cooldown
echo "" | tee -a "$OUT"
echo "=== fit-all-8 (mask ff, -t 8) $(date '+%Y-%m-%d %H:%M:%S') ===" | tee -a "$OUT"
echo "thermal before: status $(thermal_status), cpu-0-0-usr $(cpu_temp)C" | tee -a "$OUT"
taskset ff "$BENCH" -m "$MODEL" -t 8 -p 128 -n 128 -r 3 2>&1 | tee -a "$OUT"
echo "thermal after: status $(thermal_status), cpu-0-0-usr $(cpu_temp)C" | tee -a "$OUT"

echo "" | tee -a "$OUT"
echo "MemAvailable after: $(mem_avail) kB" | tee -a "$OUT"
echo "bench-phase1 done $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$OUT"
