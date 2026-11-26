#!/usr/bin/env node
// apps/rootzd/tools/harness-heartbeat.mjs — post the Rootz harness snapshot
// to the dedicated harness heartbeat route (Option B).
//
// Verified device facts (2026-11-11, redfin; see agent-demo.mjs):
//   - llama-server serves GET /health on 127.0.0.1:8399 (adb forward).
//   - The Rootz harness is the on-device llama.cpp agent lane.
//
// This tool does NOT introspect the model, quantization, or process memory:
// those values come from the snapshot file the operator supplies. It stamps
// collected_at / device.id / last_heartbeat, checks /health, and posts the
// snapshot. Until POST /v1/harness/heartbeat ships, --audit-fallback writes
// the same snapshot through POST /v1/device/audit with audit_type
// "harness-agents" — the route the web page already reads as a fallback.
//
// Usage:
//   node apps/rootzd/tools/harness-heartbeat.mjs \
//     --snapshot apps/rootzd/tools/harness-snapshot.example.json \
//     --account 1234567890123456 \
//     --device <64-hex relay device id> \
//     [--device-name "Pixel 5"] \
//     [--url http://127.0.0.1:8399] \
//     [--api https://rootmyandroid.com/v1] \
//     [--audit-fallback] [--dry-run]
//
// The account number and device id are credentials/identifiers: this tool
// prints neither in its normal output.

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const flag = (name) => args.includes('--' + name)

const SNAPSHOT_PATH = opt('snapshot', '')
const ACCOUNT = opt('account', '').replace(/[^0-9]/g, '')
const DEVICE = opt('device', '').trim().toLowerCase()
const DEVICE_NAME = opt('device-name', '')
const SERVER = opt('url', 'http://127.0.0.1:8399').replace(/\/$/, '')
const API = opt('api', 'https://rootmyandroid.com/v1').replace(/\/$/, '')
const AUDIT_FALLBACK = flag('audit-fallback')
const DRY_RUN = flag('dry-run')

function fail(message) {
  console.error(`[harness-heartbeat] ${message}`)
  process.exit(1)
}

if (!SNAPSHOT_PATH) fail('--snapshot <path> is required')
if (!/^[0-9]{16}$/.test(ACCOUNT)) {
  fail('--account must be the 16-digit account number')
}
if (!/^[0-9a-f]{64}$/.test(DEVICE)) {
  fail('--device must be the 64-hex relay device id')
}

let snapshot
try {
  snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
} catch (e) {
  fail(`cannot read snapshot: ${e.message}`)
}
if (
  !snapshot ||
  snapshot.schema !== 1 ||
  !snapshot.device ||
  !snapshot.runtime ||
  !Array.isArray(snapshot.agents)
) {
  fail('snapshot is not schema v1 (device, runtime, agents)')
}

const now = new Date().toISOString()
snapshot.collected_at = now
snapshot.device.id = DEVICE
snapshot.device.last_sync = now
if (DEVICE_NAME) snapshot.device.name = DEVICE_NAME
for (const agent of snapshot.agents) {
  if (agent && typeof agent === 'object') agent.last_heartbeat = now
}

const health = await fetch(`${SERVER}/health`, {
  signal: AbortSignal.timeout(10000),
}).catch(() => null)
const healthy = health?.status === 200
if (healthy) {
  console.log(`[harness-heartbeat] llama-server healthy on ${SERVER}`)
} else {
  console.error(
    `[harness-heartbeat] warning: llama-server /health is not 200 on ${SERVER}; marking the Rootz agent stopped`,
  )
  const rootz = snapshot.agents.find(
    (agent) => agent && typeof agent === 'object' && agent.id === 'rootz-agent',
  )
  if (rootz) {
    rootz.status = 'stopped'
    rootz.resident_gib = 0
  }
}

const payload = {
  account_number: ACCOUNT,
  device_id: DEVICE,
  device_name: snapshot.device.name,
  snapshot,
}

if (DRY_RUN) {
  console.log(
    JSON.stringify({ route: `${API}/harness/heartbeat`, payload }, null, 2),
  )
  process.exit(0)
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON body */
  }
  return { res, data }
}

let primary
try {
  primary = await post(`${API}/harness/heartbeat`, payload)
} catch (e) {
  fail(`network error: ${e.message}`)
}

if (primary.res.ok) {
  console.log(
    `[harness-heartbeat] posted to ${API}/harness/heartbeat (${primary.res.status})`,
  )
  console.log(JSON.stringify(primary.data, null, 2))
  process.exit(0)
}

if (primary.res.status === 404 && AUDIT_FALLBACK) {
  console.error(
    '[harness-heartbeat] warning: the audit fallback charges the first (device, harness-agents) slot at the audit_report price; refreshes are free. See docs/HANDOFF-2026-11-26-harness-page.md §5.4.',
  )
  console.log(
    '[harness-heartbeat] dedicated route 404 — writing through the audit fallback',
  )
  let audit
  try {
    audit = await post(`${API}/device/audit`, {
      account_number: ACCOUNT,
      device_id: DEVICE,
      audit_type: 'harness-agents',
      device_name: snapshot.device.name,
      collected_at: now,
      snapshot,
    })
  } catch (e) {
    fail(`network error: ${e.message}`)
  }
  if (audit.res.ok) {
    console.log(
      `[harness-heartbeat] posted to ${API}/device/audit (${audit.res.status})`,
    )
    console.log(JSON.stringify(audit.data, null, 2))
    process.exit(0)
  }
  fail(
    `audit fallback failed (${audit.res.status}): ${JSON.stringify(audit.data)}`,
  )
}

fail(
  `dedicated route failed (${primary.res.status}): ${JSON.stringify(primary.data)}` +
    (primary.res.status === 404 ? ' — retry with --audit-fallback' : ''),
)
