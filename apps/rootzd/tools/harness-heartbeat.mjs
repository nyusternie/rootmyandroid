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
// (device, audit_type) slot at the audit_report price. The dedicated route
// caps the snapshot at 16 KiB; the audit fallback accepts 512 KiB, so an
// oversized snapshot can succeed only through the fallback.
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
let sizeWarned = false

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

  const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot)).length
  if (snapshotBytes > 16 * 1024 && !sizeWarned) {
    console.error(
      `[harness-heartbeat] warning: snapshot is ${snapshotBytes} bytes; the dedicated route's contract cap is 16384 bytes (it may answer 413). The audit fallback accepts up to 512 KiB.`,
    )
    sizeWarned = true
  }

  const payload = {
    account_number: ACCOUNT,
    device_id: DEVICE,
    device_name: snapshot.device.name,
    snapshot,
  }

  if (DRY_RUN) {
    console.log(`[harness-heartbeat] snapshot bytes: ${snapshotBytes}`)
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

  const sizeRejected = primary.res.status === 413
  if ((primary.res.status === 404 || sizeRejected) && AUDIT_FALLBACK) {
    if (!auditWarned) {
      console.error(
        '[harness-heartbeat] warning: the audit fallback charges the first (device, harness-agents) slot at the audit_report price; refreshes are free. See docs/HANDOFF-2026-11-26-harness-page.md §5.4.',
      )
      auditWarned = true
    }
    console.log(
      `[harness-heartbeat] dedicated route rejected the snapshot (${primary.res.status}) — writing through the audit fallback`,
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
    const auditRetry = audit.data?.retry_after
      ? ` retry_after=${audit.data.retry_after}s`
      : ''
    console.error(
      `[harness-heartbeat] audit fallback failed (${audit.res.status}): ${JSON.stringify(audit.data)}${auditRetry}`,
    )
    return false
  }

  const retry = primary.data?.retry_after
    ? ` retry_after=${primary.data.retry_after}s`
    : ''
  console.error(
    `[harness-heartbeat] dedicated route failed (${primary.res.status}): ${JSON.stringify(primary.data)}${retry}` +
      (primary.res.status === 404 || primary.res.status === 413
        ? ' — retry with --audit-fallback'
        : ''),
  )
  return false
}

if (!WATCH) {
  const ok = await heartbeatOnce()
  process.exit(ok ? 0 : 1)
}

if (INTERVAL < 60) {
  console.error(
    '[harness-heartbeat] warning: the current API heartbeat IP limit is 60/h; an interval below 60s will hit 429 for one device. Raise the API limit or use --interval 60+.',
  )
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
