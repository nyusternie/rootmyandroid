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
// snapshot. The dedicated heartbeat is FREE (owner ruling 2026-11-26). Until
// POST /v1/harness/heartbeat ships, --audit-fallback writes the same snapshot
// through POST /v1/device/audit with audit_type "harness-agents" — the route
// the web page already reads as a fallback; that route charges the first
// (device, audit_type) slot at the audit_report price.
//
// Usage:
//   node apps/rootzd/tools/harness-heartbeat.mjs \
//     --snapshot apps/rootzd/tools/harness-snapshot.example.json \
//     --account 1234567890123456 \
//     --device <64-hex relay device id> \
//     [--device-name "Pixel 5"] \
//     [--url http://127.0.0.1:8399] \
//     [--api https://rootmyandroid.com/v1] \
//     [--audit-fallback] [--dry-run] \
//     [--watch] [--interval 60]
//
// One-shot is the default. --watch re-reads the snapshot file each cycle, so
// the operator can update the model/status without restarting; the default
// interval is 60 seconds and the floor is 15. SIGINT/SIGTERM stop the loop.
//
// The account number and device id are credentials/identifiers: this tool
// prints neither in its normal output (the --dry-run payload is the exception).

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
const WATCH = flag('watch')
const INTERVAL = Math.max(
  15,
  Number.parseInt(opt('interval', '60'), 10) || 60,
)

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

function loadSnapshot() {
  let snapshot
  try {
    snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
  } catch (e) {
    throw new Error(`cannot read snapshot: ${e.message}`)
  }
  if (
    !snapshot ||
    snapshot.schema !== 1 ||
    !snapshot.device ||
    !snapshot.runtime ||
    !Array.isArray(snapshot.agents)
  ) {
    throw new Error('snapshot is not schema v1 (device, runtime, agents)')
  }
  return snapshot
}

function stamp(snapshot, now) {
  snapshot.collected_at = now
  snapshot.device.id = DEVICE
  snapshot.device.last_sync = now
  if (DEVICE_NAME) snapshot.device.name = DEVICE_NAME
  for (const agent of snapshot.agents) {
    if (agent && typeof agent === 'object') agent.last_heartbeat = now
  }
}

async function checkHealth() {
  const health = await fetch(`${SERVER}/health`, {
    signal: AbortSignal.timeout(10000),
  }).catch(() => null)
  return health?.status === 200
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

// Print the /health transition once, not once per watch cycle.
let lastHealth = null
let auditWarned = false

async function heartbeatOnce() {
  let snapshot
  try {
    snapshot = loadSnapshot()
  } catch (e) {
    console.error(`[harness-heartbeat] ${e.message}`)
    return false
  }

  const now = new Date().toISOString()
  stamp(snapshot, now)

  const healthy = await checkHealth()
  if (healthy !== lastHealth) {
    if (healthy) {
      console.log(`[harness-heartbeat] llama-server healthy on ${SERVER}`)
    } else {
      console.error(
        `[harness-heartbeat] warning: llama-server /health is not 200 on ${SERVER}; marking the Rootz agent stopped`,
      )
    }
    lastHealth = healthy
  }
  if (!healthy) {
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
    return true
  }

  let primary
  try {
    primary = await post(`${API}/harness/heartbeat`, payload)
  } catch (e) {
    console.error(`[harness-heartbeat] network error: ${e.message}`)
    return false
  }

  if (primary.res.ok) {
    console.log(
      `[harness-heartbeat] posted to ${API}/harness/heartbeat (${primary.res.status})`,
    )
    console.log(JSON.stringify(primary.data, null, 2))
    return true
  }

  if (primary.res.status === 404 && AUDIT_FALLBACK) {
    if (!auditWarned) {
      console.error(
        '[harness-heartbeat] warning: the audit fallback charges the first (device, harness-agents) slot at the audit_report price; refreshes are free. See docs/HANDOFF-2026-11-26-harness-page.md §5.4.',
      )
      auditWarned = true
    }
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
      console.error(`[harness-heartbeat] network error: ${e.message}`)
      return false
    }
    if (audit.res.ok) {
      console.log(
        `[harness-heartbeat] posted to ${API}/device/audit (${audit.res.status})`,
      )
      console.log(JSON.stringify(audit.data, null, 2))
      return true
    }
    console.error(
      `[harness-heartbeat] audit fallback failed (${audit.res.status}): ${JSON.stringify(audit.data)}`,
    )
    return false
  }

  console.error(
    `[harness-heartbeat] dedicated route failed (${primary.res.status}): ${JSON.stringify(primary.data)}` +
      (primary.res.status === 404 ? ' — retry with --audit-fallback' : ''),
  )
  return false
}

if (!WATCH) {
  const ok = await heartbeatOnce()
  process.exit(ok ? 0 : 1)
}

console.log(
  `[harness-heartbeat] watch mode: every ${INTERVAL}s; snapshot ${SNAPSHOT_PATH}`,
)
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[harness-heartbeat] ${signal} — stopping`)
    process.exit(0)
  })
}
while (true) {
  await heartbeatOnce()
  await new Promise((resolve) => setTimeout(resolve, INTERVAL * 1000))
}
