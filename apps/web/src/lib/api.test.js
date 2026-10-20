// src/lib/api.test.js — tests for the API client (ported from the React-era suite).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAccount,
  createCheckout,
  createCryptoCheckout,
  getAccount,
  listAudits,
  saveAudit,
  whoami,
} from './api.js'

const BASE = 'https://rootmyandroid.com/v1'

function mockFetch(impl) {
  return vi.fn(impl)
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(status, body) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  )
}

describe('api client', () => {
  it('createAccount posts to /accounts', async () => {
    fetch.mockImplementation(() => jsonResponse(201, { account_number: '1234', credit_days: 0 }))
    const res = await createAccount()
    expect(res.ok).toBe(true)
    expect(res.data.account_number).toBe('1234')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/accounts`)
    expect(init.method).toBe('POST')
  })

  it('getAccount fetches the balance', async () => {
    fetch.mockImplementation(() => jsonResponse(200, { account_number: '1', credit_days: 42 }))
    const res = await getAccount('1234 5678')
    expect(res.data.credit_days).toBe(42)
    const [url] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/accounts/1234%205678`)
  })

  it('createCheckout posts plan + account and returns invoice url', async () => {
    fetch.mockImplementation(() => jsonResponse(201, { invoice_url: 'https://pay.example/i/1' }))
    const res = await createCheckout({ accountNumber: '1', plan: 'monthly' })
    expect(res.data.invoice_url).toContain('https://')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/billing/checkout`)
    expect(JSON.parse(init.body)).toEqual({ account_number: '1', plan: 'monthly' })
  })

  it('createCryptoCheckout hits the crypto endpoint', async () => {
    fetch.mockImplementation(() => jsonResponse(201, { invoice_url: 'https://btcpay.example/i/9' }))
    const res = await createCryptoCheckout({ accountNumber: '1', plan: 'yearly' })
    const [url] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/billing/crypto/checkout`)
    expect(res.data.invoice_url).toContain('https://')
  })

  it('surfaces 503 billing_not_configured', async () => {
    fetch.mockImplementation(() => jsonResponse(503, { error: 'billing_not_configured' }))
    const res = await createCheckout({ accountNumber: '1', plan: 'monthly' })
    expect(res.ok).toBe(false)
    expect(res.status).toBe(503)
  })

  it('whoami GETs /device/whoami', async () => {
    fetch.mockImplementation(() => jsonResponse(200, { ok: true, ip: '203.0.113.7' }))
    const res = await whoami()
    expect(res.ok).toBe(true)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/device/whoami`)
    expect(init.method).toBe('GET')
  })

  it('saveAudit posts the snapshot with its audit_type', async () => {
    fetch.mockImplementation(() => jsonResponse(201, { ok: true, device_id: 'd-1', audit_type: 'device' }))
    const snapshot = { os: 'Android 14', browser: 'Chrome 140' }
    const res = await saveAudit({
      accountNumber: '1234 5678 9012 3456',
      deviceId: 'd-1',
      auditType: 'device',
      deviceName: 'Pixel 5',
      collectedAt: '2026-10-19T18:40:00Z',
      snapshot,
    })
    expect(res.ok).toBe(true)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/device/audit`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      account_number: '1234 5678 9012 3456',
      device_id: 'd-1',
      audit_type: 'device',
      device_name: 'Pixel 5',
      collected_at: '2026-10-19T18:40:00Z',
      snapshot,
    })
  })

  it('listAudits posts the account number and optional type filter', async () => {
    fetch.mockImplementation(() => jsonResponse(200, { ok: true, audits: [] }))
    const res = await listAudits({ accountNumber: '1234 5678 9012 3456', auditType: 'backup' })
    expect(res.ok).toBe(true)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/device/audit/list`)
    expect(JSON.parse(init.body)).toEqual({
      account_number: '1234 5678 9012 3456',
      audit_type: 'backup',
    })
  })

  it('handles non-JSON responses gracefully', async () => {
    fetch.mockImplementation(() => Promise.resolve(new Response('<html>error</html>', { status: 500 })))
    const res = await createAccount()
    expect(res.ok).toBe(false)
    expect(res.status).toBe(500)
    expect(res.data).toBeNull()
  })
})
