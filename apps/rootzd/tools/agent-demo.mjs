#!/usr/bin/env node
// apps/rootzd/tools/agent-demo.mjs — live demonstration of the Lane-B
// agent harness: an LLM (llama-server on-device, HTTP over adb forward)
// driving a shell through a command guard, one JSON action per turn.
//
// The guard below is MIRRORED 1:1 from
// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/CommandGuard.kt
// (splitSegments / stripEnvAssignments / RULES order / classify /
// decide) — change both together. The demo runs with EMPTY approval
// stores, so decide() fails CLOSED: anything CAUTION or worse is
// refused and the refusal is fed back to the model as the tool result.
//
// Device truths this file depends on (all measured 2026-11-11, redfin):
//  - llama-server at /data/local/tmp/llama/llama-server serves
//    /health + /completion on 127.0.0.1:8399 (adb forward tcp:8399).
//    v0.9.0 auto-splits -c into n_slots=4; sequential single-client
//    requests reuse slot 0, so KV prefix caching works per turn.
//  - dumpsys thermalservice format varies with device state: unanchored
//    mStatus= fields (take the max) + top-level "Thermal Status: N";
//    cpu temp field is mTemp= under load, mValue= when idle; toybox
//    grep has no \| alternation (all parsed here in JS, not in grep).
//
// Usage:
//   node apps/rootzd/tools/agent-demo.mjs [--serial 0C151FDD400648]
//        [--turns 8] [--url http://127.0.0.1:8399]

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const SERIAL = opt('serial', '0C151FDD400648')
const MAX_TURNS = parseInt(opt('turns', '8'), 10)
const SERVER = opt('url', 'http://127.0.0.1:8399')

// ---------------------------------------------------------------- guard
// MIRRORED from CommandGuard.kt — keep 1:1.

const Risk = { SAFE: 0, CAUTION: 1, DANGEROUS: 2, DESTRUCTIVE: 3 }

function splitSegments(cmd) {
  const out = []
  let cur = ''
  let quote = '\0'
  let i = 0
  while (i < cmd.length) {
    const c = cmd[i]
    if (quote === '\0' && (c === '"' || c === "'")) { quote = c; cur += c }
    else if (quote !== '\0' && c === quote) { quote = '\0'; cur += c }
    else if (quote === '\0' && (c === ';' || c === '|')) {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
      if (c === '|' && i + 1 < cmd.length && cmd[i + 1] === '|') i++
    } else if (quote === '\0' && c === '&' && i + 1 < cmd.length && cmd[i + 1] === '&') {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
      i++
    } else cur += c
    i++
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

function stripEnvAssignments(segment) {
  let s = segment
  const env = /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/
  while (env.test(s)) s = s.replace(env, '')
  return s
}

const RULES = [
  { risk: Risk.DESTRUCTIVE, key: 'pm clear', reason: 'ERASES all data of the target app. This is a wipe.', matches: (t, v) => v === 'pm' && t[1] === 'clear' },
  { risk: Risk.DESTRUCTIVE, key: 'pm uninstall', reason: 'REMOVES the target app and its data.', matches: (t, v) => v === 'pm' && t[1] === 'uninstall' },
  { risk: Risk.DESTRUCTIVE, key: 'rm -r/-f', reason: 'DELETES files with -r and/or -f. Gone means gone.', matches: (t, v) => v === 'rm' && t.slice(1).some(f => f.startsWith('-') && /[rRf]/.test(f)) },
  { risk: Risk.DESTRUCTIVE, key: 'dd of=', reason: 'Raw block-level WRITE. Can brick the device.', matches: (t, v) => v === 'dd' && t.slice(1).some(f => f.startsWith('of=')) },
  { risk: Risk.DESTRUCTIVE, key: 'mkfs', reason: 'FORMATS a filesystem. Irreversible.', matches: (t, v) => v.startsWith('mkfs') },
  { risk: Risk.DESTRUCTIVE, key: 'wipe', reason: 'WIPES device data partitions.', matches: (t, v) => v === 'wipe' },
  { risk: Risk.DESTRUCTIVE, key: 'fastboot flash/unlock', reason: 'Bootloader-level flash/unlock — unlock WIPES the device.', matches: (t, v) => v === 'fastboot' },
  { risk: Risk.DESTRUCTIVE, key: 'recovery --wipe_data', reason: 'Boots into recovery to WIPE user data.', matches: (t, v) => v === 'recovery' && t.some(x => x.includes('wipe')) },
  { risk: Risk.DANGEROUS, key: 'rm', reason: 'DELETES the named file(s).', matches: (t, v) => v === 'rm' },
  { risk: Risk.DANGEROUS, key: 'am force-stop', reason: 'FORCE-KILLS the target app.', matches: (t, v) => v === 'am' && t[1] === 'force-stop' },
  { risk: Risk.DANGEROUS, key: 'pm disable-user', reason: 'DISABLES the target app for this user.', matches: (t, v) => v === 'pm' && ['disable-user', 'disable'].includes(t[1]) },
  { risk: Risk.DANGEROUS, key: 'kill', reason: 'SENDS a signal to a process.', matches: (t, v) => v === 'kill' || v === 'killall' || v === 'pkill' },
  { risk: Risk.DANGEROUS, key: 'mount', reason: 'MOUNTS/REMOUNTS a filesystem. (Bare mount with no arguments only lists and is NOT gated.)', matches: (t, v) => v === 'mount' && t.length > 1 },
  { risk: Risk.CAUTION, key: 'settings put', reason: 'CHANGES a system setting.', matches: (t, v) => v === 'settings' && t[1] === 'put' },
  { risk: Risk.CAUTION, key: 'setprop', reason: 'CHANGES a runtime system property.', matches: (t, v) => v === 'setprop' },
  { risk: Risk.CAUTION, key: 'device_config put', reason: 'CHANGES a DeviceConfig flag.', matches: (t, v) => v === 'device_config' && ['put', 'delete'].includes(t[1]) },
  { risk: Risk.CAUTION, key: 'appops set', reason: 'CHANGES an AppOps permission.', matches: (t, v) => v === 'appops' && t[1] === 'set' },
  { risk: Risk.CAUTION, key: 'pm enable', reason: 'RE-ENABLES a disabled app.', matches: (t, v) => v === 'pm' && t[1] === 'enable' },
  { risk: Risk.CAUTION, key: 'pm suspend/trim', reason: 'CHANGES package state.', matches: (t, v) => v === 'pm' && ['suspend', 'unsuspend', 'trim-caches'].includes(t[1]) },
  { risk: Risk.CAUTION, key: 'svc', reason: 'TOGGLES radios/services.', matches: (t, v) => v === 'svc' },
  { risk: Risk.CAUTION, key: 'reboot', reason: 'REBOOTS the device.', matches: (t, v) => v === 'reboot' },
  { risk: Risk.CAUTION, key: 'logcat -c', reason: 'CLEARS the log buffer — destroys log evidence.', matches: (t, v) => v === 'logcat' && t.slice(1).some(f => f === '-c' || f === '--clear') },
  { risk: Risk.CAUTION, key: 'input', reason: 'INJECTS keys/taps into the foreground app.', matches: (t, v) => v === 'input' },
  { risk: Risk.CAUTION, key: 'su', reason: 'REQUESTS privilege escalation.', matches: (t, v) => v === 'su' },
  { risk: Risk.CAUTION, key: 'sh -c/script', reason: 'RUNS an arbitrary script — the guard cannot see inside it.', matches: (t, v) => v === 'sh' || v === 'bash' || v.endsWith('.sh') },
]

function classify(cmd) {
  return splitSegments(cmd).map(raw => {
    const segment = stripEnvAssignments(raw)
    const tokens = segment.split(/\s+/).filter(t => t.length > 0)
    const verb = (tokens[0] || '').toLowerCase()
    const rule = RULES.find(r => rule_matches(r, tokens, verb))
    return rule
      ? { segment, risk: rule.risk, key: rule.key, reason: rule.reason }
      : { segment, risk: Risk.SAFE, key: '', reason: '' }
  })
}
function rule_matches(r, t, v) { return r.matches(t, v) }

/** Empty approval stores (session = always = {}): fail closed. */
function decide(cmd) {
  const findings = classify(cmd)
  const risk = findings.length ? Math.max(...findings.map(f => f.risk)) : Risk.SAFE
  return { risk, allow: risk === Risk.SAFE, findings }
}

// ---------------------------------------------------------------- device

function adb(shellCmd, timeoutMs = 20000) {
  try {
    const stdout = execFileSync('adb', ['-s', SERIAL, 'shell', shellCmd], {
      timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024,
    }).toString()
    return { rc: 0, stdout: stdout.trim(), stderr: '' }
  } catch (e) {
    const stdout = e.stdout ? e.stdout.toString().trim() : ''
    const stderr = e.stderr ? e.stderr.toString().trim() : ''
    if (e.killed || (e.signal === null && e.code === 'ETIMEDOUT')) {
      return { rc: 124, stdout, stderr: stderr || 'host-side timeout' }
    }
    return { rc: typeof e.status === 'number' ? e.status : 1, stdout, stderr }
  }
}

function thermal() {
  const dump = adb('dumpsys thermalservice').stdout
  const statuses = [...dump.matchAll(/mStatus=(\d)/g)].map(m => parseInt(m[1], 10))
  const top = /Thermal Status: (\d)/.exec(dump)
  if (top) statuses.push(parseInt(top[1], 10))
  const line = dump.split('\n').find(l => l.includes('mName=cpu-0-0-usr')) || ''
  const tempM = /mTemp=([\d.]+)/.exec(line) || /mValue=([\d.]+)/.exec(line)
  return {
    status: statuses.length ? Math.max(...statuses) : 9,
    cpu: tempM ? parseFloat(tempM[1]) : 999,
  }
}

// ---------------------------------------------------------------- loop

// 2026-11-11 iteration 2 (owner-approved): the free-form goal let the
// model drift into unrequested getprop trivia, never recover from an
// empty result, and repeat turn 2's command (measured in
// results/agent-demo-202611112331.log). Now a numbered checklist with
// order / no-repeat / empty-result rules and a done-gate on the items.
const GOAL = `You are an on-device agent driving an Android shell over ADB, one action per turn.
Reply with EXACTLY one JSON object per turn, nothing else:
  {"tool": "shell", "cmd": "<one read-only command>"}
  {"done": "<concise findings summary>"}
A command guard REFUSES anything not read-only (no rm, pm clear/uninstall, su, setprop, settings put, reboot, dd, mount, kill...). Refusals come back as the tool result — pick a different read-only command.
RULES:
1. Work the CHECKLIST in order — each turn must target the first item not yet answered.
2. NEVER repeat a command you already ran.
3. Empty stdout means the command was wrong — try the canonical alternative (e.g. getenforce for SELinux state, which su for a su binary).
4. Use done ONLY when every checklist item is answered.
CHECKLIST:
[1] device model
[2] Android version
[3] SELinux state
[4] is root present?
[5] what provides root?`

function buildPrompt(transcript) {
  const body = GOAL + '\n\n' + transcript.map(e =>
    e.role === 'assistant' ? `assistant: ${e.text}` : `user: result ${e.text}`
  ).join('\n') + (transcript.length ? '\nassistant: ' : '')
  return `<|im_start|>user\n${body}<|im_end|>\n<|im_start|>assistant\n`
}

function extractJson(text) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    let depth = 0, str = false, esc = false
    for (let j = i; j < text.length; j++) {
      const c = text[j]
      if (esc) { esc = false; continue }
      if (c === '\\') { esc = true; continue }
      if (c === '"') str = !str
      if (str) continue
      if (c === '{') depth++
      if (c === '}') {
        depth--
        if (depth === 0) {
          try { return JSON.parse(text.slice(i, j + 1)) } catch { break }
        }
      }
    }
  }
  return null
}

async function complete(prompt) {
  const t0 = Date.now()
  const res = await fetch(SERVER + '/completion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt, temperature: 0, n_predict: 128, cache_prompt: true,
      stop: ['<|im_end|>', '\nuser:', '\nassistant:', '\nU:', '\nA:'],
    }),
    signal: AbortSignal.timeout(300000),
  })
  const data = await res.json()
  return { text: data.content || '', ms: Date.now() - t0, timings: data.timings || {} }
}

const log = []
const say = s => { log.push(s); console.log(s) }

async function main() {
  say(`[agent-demo ${new Date().toISOString()}] Lane-B harness demo — serial=${SERIAL} server=${SERVER} turns<=${MAX_TURNS}`)
  const th = thermal()
  say(`[agent-demo] preflight thermal: status=${th.status} cpu=${th.cpu}C`)
  if (th.status >= 2) { say('[agent-demo] ABORT: thermal status >= 2 (owner policy)'); return 2 }
  const health = await fetch(SERVER + '/health', { signal: AbortSignal.timeout(10000) }).catch(() => null)
  if (!health || health.status !== 200) { say('[agent-demo] ABORT: llama-server not healthy on ' + SERVER); return 2 }
  say('[agent-demo] llama-server healthy. Guard: MIRRORED CommandGuard.kt, empty approval stores (fail closed).')
  say('--- transcript ---')

  const transcript = []
  // 2026-11-11 iteration 3 (owner-approved): repeated-action detection
  // lives in the DRIVER, not the model — Phase-3 t3 + both demo runs
  // measured that models at EVERY tier (4B-2507 included) loop on a
  // stalled sub-goal under greedy decoding. An exact repeat of an
  // ALREADY-EXECUTED command is refused to execute and nudged back.
  const executed = new Set()
  let parseFails = 0
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const t = thermal()
    if (th.status >= 2 || t.status >= 2) { say(`[agent-demo] ABORT at turn ${turn}: thermal status=${t.status}`); break }
    const r = await complete(buildPrompt(transcript))
    const action = extractJson(r.text)
    const tps = r.timings.predicted_per_second ? r.timings.predicted_per_second.toFixed(2) : '?'
    if (!action) {
      parseFails++
      say(`turn ${turn} | MODEL UNPARSEABLE (${r.ms}ms, gen ${tps} t/s): ${JSON.stringify(r.text.slice(0, 200))}`)
      transcript.push({ role: 'assistant', text: r.text.slice(0, 200) })
      transcript.push({ role: 'user', text: JSON.stringify({ error: 'not a JSON object; reply with exactly one JSON object' }) })
      if (parseFails >= 3) { say('[agent-demo] ABORT: 3 consecutive parse failures'); break }
      continue
    }
    parseFails = 0
    const actionJson = JSON.stringify(action)
    say(`turn ${turn} | assistant: ${actionJson} (${r.ms}ms, gen ${tps} t/s)`)
    transcript.push({ role: 'assistant', text: actionJson })
    if (typeof action.done === 'string') {
      say(`turn ${turn} | DONE — model's findings: ${action.done}`)
      break
    }
    if (action.tool !== 'shell' || typeof action.cmd !== 'string' || !action.cmd.trim()) {
      transcript.push({ role: 'user', text: JSON.stringify({ error: 'unknown action; expected {"tool":"shell","cmd":"..."} or {"done":"..."}' }) })
      continue
    }
    const verdict = decide(action.cmd)
    let result
    if (!verdict.allow) {
      const worst = verdict.findings.find(f => f.risk === verdict.risk)
      result = JSON.stringify({ guard: 'REFUSED', risk: Object.keys(Risk)[verdict.risk], pattern: worst.key, reason: worst.reason })
    } else if (executed.has(action.cmd.trim().replace(/\s+/g, ' '))) {
      result = JSON.stringify({ guard: 'LOOP', error: 'you already ran this exact command — pick a DIFFERENT command that targets the first unanswered checklist item' })
    } else {
      executed.add(action.cmd.trim().replace(/\s+/g, ' '))
      const ex = adb(action.cmd, 15000)
      result = JSON.stringify({ rc: ex.rc, stdout: ex.stdout.slice(0, 400), stderr: ex.stderr.slice(0, 200) })
    }
    say(`turn ${turn} | result: ${result}`)
    transcript.push({ role: 'user', text: result })
  }

  say('--- end transcript ---')
  mkdirSync(join(HERE, 'results'), { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)
  const logPath = join(HERE, 'results', `agent-demo-${stamp}.log`)
  writeFileSync(logPath, log.join('\n') + '\n')
  say(`[agent-demo] log written: ${logPath}`)
  return 0
}

main().then(rc => process.exit(rc)).catch(e => { console.error(e); process.exit(1) })
