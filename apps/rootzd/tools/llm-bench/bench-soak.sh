#!/system/bin/sh
# apps/rootzd/tools/llm-bench/bench-soak.sh — thermal soak: sustained
# multi-minute generation on the Phase-1 model (Qwen2.5-1.5B-Instruct
# Q4_K_M) to find throttle onset and exercise the abort policy for real
# (owner-ruled ordering: Phase 0 matrix, Phase 1 fit, Phase 2 4B
# envelope, then this soak).
#
# Load: llama-bench -p 128 -n 2048 -r 1, all 8 cores (mask ff, -t 8).
# At the measured tg of ~7.5 t/s (Phase 1) the 2048-token generation
# alone runs ~4.5 minutes continuously.
#
# Telemetry: a background sampler appends a line every 10 s for the
# whole run:
#   elapsed_s | thermal status | cpu-0-0-usr C | per-core kHz (cpu0..7)
# Per-core frequency is READABLE as the shell user on redfin
# (verified 2026-11-11: /sys/devices/system/cpu/cpuN/cpufreq/
# scaling_cur_freq), so throttling shows up directly as falling kHz.
# Temperature comes from dumpsys thermalservice and status is the max
# mStatus= across Temperature{...} lines (measured fixes from Phase 0:
# /sys/class/thermal is NOT readable as shell, `mTemp=` does not exist
# in this build's dumpsys).
#
# Thermal policy (owner ruling): the PRE-RUN gate aborts at status >= 2
# and halts at >= 3. DURING the sustained run the sampler only LOGS —
# llama-bench cannot be cleanly paused, and the point of the soak is to
# observe the real thermal trajectory under load; if status reaches 3
# the sampler says HALT-CONDITION and the script stops the bench
# process (killing by pid) rather than the device.
#
# Runs on-device from /data/local/tmp/llama as the shell user:
#   adb push bench-soak.sh /data/local/tmp/llama/
#   adb shell 'cd /data/local/tmp/llama && sh bench-soak.sh 2>&1 | tee bench-soak-$(date +%Y%m%d-%H%M%S).log'

set -u
cd /data/local/tmp/llama
BENCH=./llama-bench
MODEL="qwen2.5-1.5b-instruct-q4_k_m.gguf"
LOG_TAG="soak $(date -u +%Y-%m-%dT%H:%M:%SZ)"

say() { echo "[$LOG_TAG] $*"; }

memavail_kb() {
  awk '/^MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null
}

cpu_temp() {
  dumpsys thermalservice 2>/dev/null \
    | grep -o 'Temperature{mValue=[0-9.]*, mType=0, mName=cpu-0-0-usr' \
    | grep -o '[0-9.]*' | head -1
}

thermal_status() {
  dumpsys thermalservice 2>/dev/null | grep 'Temperature{' \
    | grep -o 'mStatus=[0-9]' | grep -o '[0-9]' | sort -rn | head -1
}

freqs() {
  out=""
  for f in /sys/devices/system/cpu/cpu[0-7]/cpufreq/scaling_cur_freq; do
    v=$(cat "$f" 2>/dev/null)
    out="$out ${v:-?}"
  done
  echo "${out# }"
}

guard() {
  s=$(thermal_status)
  s=${s:-0}
  if [ "$s" -ge 3 ]; then
    say "HALT: Thermal Status $s (>= 3) — stopping suite immediately"
    exit 3
  fi
  if [ "$s" -ge 2 ]; then
    say "ABORT: Thermal Status $s (>= 2) — soak not started; device needs cooling"
    return 1
  fi
  return 0
}

sampler() {
  # $1 = pid of the bench process to watch
  bench_pid="$1"
  start_s=$(date +%s)
  while kill -0 "$bench_pid" 2>/dev/null; do
    s=$(thermal_status); s=${s:-?}
    t=$(cpu_temp); t=${t:-?}
    now_s=$(date +%s)
    say "SAMPLE $((now_s - start_s))s status=$s cpu=${t}C kHz=[$(freqs)]"
    if [ "$s" != "?" ] && [ "$s" -ge 3 ]; then
      say "HALT-CONDITION: status $s (>= 3) during soak — stopping bench pid $bench_pid"
      kill "$bench_pid" 2>/dev/null
      return 3
    fi
    sleep 10
  done
  return 0
}

say "=== Thermal soak — sustained generation on $MODEL ==="
say "device: $(getprop ro.product.model) / $(getprop ro.build.version.release) / $(getprop ro.product.device)"
ls -la "$MODEL" 2>&1
say "MemAvailable before soak: $(memavail_kb) kB"
say "baseline: status=$(thermal_status) cpu=$(cpu_temp)C kHz=[$(freqs)]"

guard || exit 1

say "RUN soak (llama-bench -p 128 -n 2048 -r 1, mask ff, -t 8)"
taskset ff "$BENCH" -m "$MODEL" -p 128 -n 2048 -r 1 2>&1 &
bench_pid=$!
sampler "$bench_pid"
sampler_rc=$?
wait "$bench_pid"
bench_rc=$?

say "END soak rc=$bench_rc sampler_rc=$sampler_rc"
say "final: status=$(thermal_status) cpu=$(cpu_temp)C kHz=[$(freqs)]"
say "MemAvailable after soak: $(memavail_kb) kB"
say "=== Thermal soak finished ==="
