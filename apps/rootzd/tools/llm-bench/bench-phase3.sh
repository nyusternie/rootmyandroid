#!/system/bin/sh
# apps/rootzd/tools/llm-bench/bench-phase3.sh — Phase 3: agent-quality
# smoke. Phase 0-2 + soak answered "does it fit, how fast, how hot"; this
# phase answers the question that picks the Lane B harness model: can the
# model actually emit MACHINE-PARSEABLE agent actions.
#
# Owner-approved scope 2026-11-11. Three duty tiers under test:
#   0.5B  qwen2.5-0.5b-instruct-q4_k_m.gguf        — routing/formatting floor (control)
#   1.5B  qwen2.5-1.5b-instruct-q4_k_m.gguf        — fallback agent tier
#   4B    Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf  — primary candidate
# (Qwen3-4B base is skipped: the 2507 refresh is its successor for agent
# duty and base thermal behavior is already recorded in Phase 2.)
#
# Three tests per model, each a single-turn llama-cli run (-st; this
# v0.9.0 llama-cli has no --no-cnv — measured in Phase 2), greedy
# decoding (--temp 0) so results are reproducible, -c 4096 (KV: 0.56 GiB
# for the 4B at f16 — fits), generation capped at -n 256:
#
#   t1 json-answer   — "reply with ONLY a JSON object {answer, confidence}"
#                      PASS: a JSON object parses out of the completion,
#                      both keys present, answer is a string, confidence
#                      is a number.
#   t2 tool-call     — one tool offered: shell(cmd) [read-only framing];
#                      "reply with ONLY {\"tool\":\"shell\",\"cmd\":...}
#                      to answer: what Android version is this device?"
#                      PASS: JSON parses, tool == "shell", cmd is a
#                      non-empty string. Dangerous-command patterns
#                      (rm -rf, pm clear, dd if=, reboot, mkfs, su) are
#                      ANNOTATED on the score line, not failed — execution
#                      gating is CommandGuard's job, not the model's.
#   t3 plan-then-react — the completion must continue a FIXED two-message
#                      transcript (user asked for a root-check plan as
#                      JSON; a fake shell tool already returned
#                      "uid=0(root)") with the NEXT action as a JSON
#                      object. PASS: JSON parses and it is not an exact
#                      echo of the transcript's earlier action.
#
# Scoring is LOCAL and offline: this harness only delimits results
# (=== RESULT tN model=<slug> === / === END ===) in the log; the parser
# is apps/rootzd/tools/llm-bench/score-phase3.py (python3 stdlib).
#
# Thermal policy identical to Phase 2/soak (owner-ruled): per-cell guard
# aborts >= 2, hard-halts >= 3; inter-cell cooldown requires BOTH
# temp <= 50C AND status < 2 (temperature-only gating re-ran hot —
# measured 2026-11-11).
#
# Usage: adb push to /data/local/tmp/llama/, then:
#   adb shell 'cd /data/local/tmp/llama && sh ./bench-phase3.sh 2>&1 | tee bench-phase3-<UTCSTAMP>.log'

set -u
cd /data/local/tmp/llama

say() { echo "[phase3 $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

memavail_kb() { awk '/^MemAvailable:/ {print $2}' /proc/meminfo; }

cpu_temp() {
  # Format-agnostic (measured 2026-11-11): under load the Temperature
  # lines sit at column 0 with an mTemp= field; on an idle device the
  # dump switches to a tab-indented "Cached temperatures:" section whose
  # field is mValue= — anchored/ordered patterns then silently read
  # nothing and the fail-safe 999 engages (correct behavior, wrong data).
  # Measured 2026-11-11 #2: toybox grep does NOT support GNU BRE \|
  # alternation (rc=1, no match) — use two sequential greps, mTemp first.
  local t
  t=$(dumpsys thermalservice 2>/dev/null | grep 'mName=cpu-0-0-usr' | head -1 | grep -o 'mTemp=[0-9.]*' | head -1 | cut -d= -f2)
  if [ -z "$t" ]; then
    t=$(dumpsys thermalservice 2>/dev/null | grep 'mName=cpu-0-0-usr' | head -1 | grep -o 'mValue=[0-9.]*' | head -1 | cut -d= -f2)
  fi
  echo "${t:-999}"
}

thermal_status() {
  # Format-agnostic: max of (a) every mStatus= field anywhere in the
  # dump (indentation varies, see cpu_temp) and (b) the always-present
  # top-level "Thermal Status: N" line. Fail-safe 9 if both vanish.
  local s a b
  a=$(dumpsys thermalservice 2>/dev/null)
  s=$(printf '%s' "$a" | grep -o 'mStatus=[0-9]*' | cut -d= -f2 | sort -n | tail -1)
  b=$(printf '%s' "$a" | grep 'Thermal Status:' | grep -o '[0-9]*' | tail -1)
  [ -n "$b" ] && [ "${s:-0}" -lt "$b" ] && s=$b
  echo "${s:-9}"
}

guard() {
  local s; s=$(thermal_status)
  if [ "$s" -ge 3 ]; then
    say "HARD HALT: thermal status $s (>= 3) — exiting (owner policy: protect the device)"
    exit 3
  fi
  if [ "$s" -ge 2 ]; then
    say "ABORT: thermal status $s (>= 2) — refusing to start cell (owner policy)"
    return 1
  fi
  return 0
}

cooldown() {
  local t s t_int i
  for i in $(seq 1 20); do
    t=$(cpu_temp); s=$(thermal_status); t_int=${t%.*}
    if [ "${t_int:-999}" -le 50 ] && [ "$s" -lt 2 ]; then
      say "cooldown: cpu temp ${t}C <= 50C and status $s < 2 — proceeding"
      return 0
    fi
    say "cooldown: cpu temp ${t}C, status $s — waiting 30s ($i/20)"
    sleep 30
  done
  say "cooldown: exceeded 600s without clearing — refusing next cell"
  return 1
}

run_cell() {
  # run_cell <model-slug> <test-id> <prompt>
  local slug="$1" tid="$2" prompt="$3"
  say "RUN ${tid} model=${slug} (./llama-cli -m ${slug}.gguf -st --temp 0 -t 8 -c 4096 -n 256) — thermal: status=$(thermal_status) cpu=$(cpu_temp)C memavail=$(memavail_kb)kB"
  echo "=== RESULT ${tid} model=${slug} ==="
  taskset ff ./llama-cli -m "${slug}.gguf" -st --temp 0 -t 8 -c 4096 -n 256 -p "$prompt" 2>&1
  local rc=$?
  echo "=== END ${tid} model=${slug} rc=${rc} ==="
  say "END ${tid} model=${slug} rc=${rc} — thermal: status=$(thermal_status) cpu=$(cpu_temp)C"
  return $rc
}

# Fixed prompts (reproducibility: every byte of the input is recorded here
# and echoed into the log by llama-cli itself).
P_T1='You are an on-device assistant. Reply with ONLY a JSON object with two keys: "answer" (a string) and "confidence" (a number between 0 and 1). No other text. Question: what is the capital of France?'
P_T2='You control an Android device through one read-only tool: shell(cmd) — it runs a shell command and returns the output. Reply with ONLY a JSON object of the form {"tool": "shell", "cmd": "<command>"}. No other text. Task: find out which Android version this device runs.'
P_T3='This is a transcript of an agent session. User: "Check whether this device is rooted. Reply only with JSON actions." Assistant: {"tool": "shell", "cmd": "id"} Tool result: "uid=0(root) gid=0(root)". Assistant:'

MODELS="qwen2.5-0.5b-instruct-q4_k_m qwen2.5-1.5b-instruct-q4_k_m Qwen_Qwen3-4B-Instruct-2507-Q4_K_M"

say "=== Phase 3 — agent-quality smoke on redfin ==="
say "models under test: $MODELS"

for slug in $MODELS; do
  cooldown || continue
  guard || continue
  run_cell "$slug" t1 "$P_T1"
  cooldown || continue
  guard || continue
  run_cell "$slug" t2 "$P_T2"
  cooldown || continue
  guard || continue
  run_cell "$slug" t3 "$P_T3"
done

say "=== Phase 3 suite finished — score with: python3 score-phase3.py <log> ==="
