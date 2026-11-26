#!/usr/bin/env node
// apps/web/tools/mock-harness-api.mjs — DEV-ONLY mock of the Option B routes.
//
// Purpose: exercise the /harness page's dedicated-route path before the
// Worker route exists. It is NOT production code and is not imported by the
// site. It implements the contract in
// docs/HANDOFF-2026-11-26-harness-api.md:
//   POST /v1/harness/heartbeat
//   POST /v1/harness/agents/list
// plus the relay device list and the audit fallback, so the page's picker
// and both registry paths work end to end.
//
// Usage:
//   node apps/web/tools/mock-harness-api.mjs [--port 8787] [--snapshot path]
//
// Then, on https://rootmyandroid.com/harness/ (or a local Astro dev server),
// set this in the browser console before pressing Sync agents:
//   window.__RMA_API_BASE__ = 'http://127.0.0.1:8787/v1'
// Account 1234567890123456, device aaaa… (the mock preloads the example).
//
// The heartbeat is free, exactly like the real route. The audit fallback in
// this mock is free too; the real audit route charges the first slot.

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}

const PORT = Number.parseInt(opt('port', '8787'), 10)
const SNAPSHOT_PATH = opt(
  'snapshot',
  join(HERE, '..', '..', 'rootzd', 'tools', 'harness-snapshot.example.json'),
)
const MOCK_ACCOUNT = '1234567890123456'
const MOCK_DEVICE = 'a'.repeat(64)

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

const snapshots = new Map()
const audits = new Map()
const key = (account, device) => `${account}:${device}`

function json(res, status, body) {
  res.writeHead(status, { ...cors, 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1024 * 1024) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function accountOf(body) {
  return String(body.account_number ?? '').replace(/[^0-9]/g, '')
}

function deviceOf(body) {
  return String(body.device_id ?? '').trim().toLowerCase()
}

function validAccount(account) {
  return /^[0-9]{16}$/.test(account)
}

function validDevice(device) {
  return /^[0-9a-f]{64}$/.test(device)
}

function validSnapshot(snapshot) {
  return (
    snapshot &&
    typeof snapshot === 'object' &&
    !Array.isArray(snapshot) &&
    snapshot.schema === 1 &&
    snapshot.device &&
    typeof snapshot.device === 'object' &&
    snapshot.runtime &&
    typeof snapshot.runtime === 'object' &&
    Array.isArray(snapshot.agents)
  )
}

const example = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
const now = new Date().toISOString()
example.collected_at = now
example.device.id = MOCK_DEVICE
example.device.last_sync = now
for (const agent of example.agents) agent.last_heartbeat = now
snapshots.set(key(MOCK_ACCOUNT, MOCK_DEVICE), {
  snapshot: example,
  received_at: now,
})
audits.set(key(MOCK_ACCOUNT, MOCK_DEVICE), {
  device_id: MOCK_DEVICE,
  snapshot: example,
})

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname

  try {
    if (req.method === 'GET' && path === '/v1/health') {
      json(res, 200, { ok: true, mock: true })
      return
    }

    if (req.method === 'POST' && path === '/v1/relay/devices/list') {
      const body = await readBody(req)
      const account = accountOf(body)
      if (!validAccount(account)) {
        json(res, 400, { ok: false, error: 'invalid_account_number' })
        return
      }
      const seen = new Set([MOCK_DEVICE])
      for (const map of [snapshots, audits]) {
        for (const k of map.keys()) {
          if (k.startsWith(`${account}:`)) seen.add(k.slice(account.length + 1))
        }
      }
      json(res, 200, {
        ok: true,
        devices: [...seen].map((device_id) => ({
          device_id,
          device_name: 'Pixel 5 (mock)',
        })),
      })
      return
    }

    if (req.method === 'POST' && path === '/v1/harness/heartbeat') {
      const body = await readBody(req)
      const account = accountOf(body)
      const device = deviceOf(body)
      if (!validAccount(account)) {
        json(res, 400, { ok: false, error: 'invalid_account_number' })
        return
      }
      if (!validDevice(device)) {
        json(res, 400, { ok: false, error: 'invalid_device_id' })
        return
      }
      if (!validSnapshot(body.snapshot)) {
        json(res, 400, { ok: false, error: 'invalid_snapshot' })
        return
      }
      if (new TextEncoder().encode(JSON.stringify(body.snapshot)).length > 16 * 1024) {
        json(res, 413, { ok: false, error: 'snapshot_too_large' })
        return
      }
      const received_at = new Date().toISOString()
      snapshots.set(key(account, device), {
        snapshot: body.snapshot,
        received_at,
      })
      json(res, 200, { ok: true, device_id: device, received_at, free: true })
      return
    }

    if (req.method === 'POST' && path === '/v1/harness/agents/list') {
      const body = await readBody(req)
      const account = accountOf(body)
      const device = deviceOf(body)
      if (!validAccount(account)) {
        json(res, 400, { ok: false, error: 'invalid_account_number' })
        return
      }
      if (!validDevice(device)) {
        json(res, 400, { ok: false, error: 'invalid_device_id' })
        return
      }
      const row = snapshots.get(key(account, device))
      if (!row) {
        json(res, 404, { ok: false, error: 'harness_snapshot_not_found' })
        return
      }
      json(res, 200, {
        ok: true,
        snapshot: row.snapshot,
        received_at: row.received_at,
      })
      return
    }

    if (req.method === 'POST' && path === '/v1/device/audit') {
      const body = await readBody(req)
      const account = accountOf(body)
      const device = deviceOf(body)
      if (!validAccount(account)) {
        json(res, 400, { ok: false, error: 'invalid_account_number' })
        return
      }
      if (!validDevice(device)) {
        json(res, 400, { ok: false, error: 'invalid_device_id' })
        return
      }
      if (!validSnapshot(body.snapshot)) {
        json(res, 400, { ok: false, error: 'invalid_snapshot' })
        return
      }
      audits.set(key(account, device), {
        device_id: device,
        snapshot: body.snapshot,
      })
      json(res, 200, {
        ok: true,
        device_id: device,
        audit_type: 'harness-agents',
        charged: 0,
      })
      return
    }

    if (req.method === 'POST' && path === '/v1/device/audit/list') {
      const body = await readBody(req)
      const account = accountOf(body)
      if (!validAccount(account)) {
        json(res, 400, { ok: false, error: 'invalid_account_number' })
        return
      }
      if (body.audit_type && body.audit_type !== 'harness-agents') {
        json(res, 200, { ok: true, audits: [] })
        return
      }
      const rows = []
      for (const [k, row] of audits) {
        if (k.startsWith(`${account}:`)) rows.push(row)
      }
      json(res, 200, { ok: true, audits: rows })
      return
    }

    json(res, 404, { ok: false, error: 'not_found' })
  } catch (e) {
    json(res, 400, { ok: false, error: 'invalid_json', detail: e.message })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-harness-api] DEV ONLY — listening on http://127.0.0.1:${PORT}/v1`)
  console.log(`[mock-harness-api] account ${MOCK_ACCOUNT}`)
  console.log(`[mock-harness-api] device ${MOCK_DEVICE.slice(0, 8)}… (mock)`)
  console.log(
    `[mock-harness-api] browser console: window.__RMA_API_BASE__ = 'http://127.0.0.1:${PORT}/v1'`,
  )
})
