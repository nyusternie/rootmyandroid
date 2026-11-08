// src/lib/api.test.js — tests for the API client (ported from the React-era suite).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAccount,
  createCheckout,
  createCryptoCheckout,
  getAccount,
  getPaymentStatus,
  createSupportConversation,
  getSupportMessages,
  listAudits,
  postSupportEscalate,
  postSupportGuru,
  postSupportGuruQuote,
  postSupportMessage,
  redeemCode,
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

  it('getPaymentStatus reads a payment by id', async () => {
    fetch.mockImplementation(() => jsonResponse(200, { ok: true, payment_status: 'confirming' }))
    const res = await getPaymentStatus('6427529765')
    expect(res.data.payment_status).toBe('confirming')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/billing/payment/6427529765`)
    expect(init.method).toBe('GET')
  })

  it('redeemCode posts the account number and code to /redeem', async () => {
    fetch.mockImplementation(() =>
      jsonResponse(200, { ok: true, redeemed: 100 })
    )
    const res = await redeemCode({
      accountNumber: '1234 5678 9012 3456',
      code: 'ABCD-EFGH-JKMN-PQRS',
    })
    expect(res.data.redeemed).toBe(100)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/redeem`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      account_number: '1234 5678 9012 3456',
      code: 'ABCD-EFGH-JKMN-PQRS',
    })
  })

  it('createSupportConversation posts mode + first message, dropping undefined fields', async () => {
    fetch.mockImplementation(() =>
      jsonResponse(201, { ok: true, conversation_id: 'a'.repeat(32), token: 'b'.repeat(64), mode: 'message', status: 'open', message: { id: 1, sender: 'visitor', body: 'hi', ts: 1762128000 } })
    )
    const res = await createSupportConversation({ mode: 'message', body: 'hi', email: 'a@b.co', accountNumber: undefined })
    expect(res.ok).toBe(true)
    expect(res.data.token).toBe('b'.repeat(64))
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/support/conversations`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ mode: 'message', body: 'hi', email: 'a@b.co' })
  })

  it('getSupportMessages sends the bearer token and the after cursor', async () => {
    fetch.mockImplementation(() =>
      jsonResponse(200, { ok: true, conversation: { id: 'a'.repeat(32), mode: 'realtime', status: 'open', created_ts: 1762128000 }, messages: [] })
    )
    const res = await getSupportMessages({ conversationId: 'a'.repeat(32), token: 'b'.repeat(64), after: 7 })
    expect(res.ok).toBe(true)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/support/conversations/${'a'.repeat(32)}/messages?after=7`)
    expect(init.method).toBe('GET')
    expect(init.headers).toEqual({ 'x-support-token': 'b'.repeat(64) })
  })

  it('getSupportMessages omits the after param when resuming (full history)', async () => {
    fetch.mockImplementation(() =>
      jsonResponse(200, { ok: true, conversation: { id: 'a'.repeat(32), mode: 'realtime', status: 'open', created_ts: 1762128000 }, messages: [] })
    )
    await getSupportMessages({ conversationId: 'a'.repeat(32), token: 'b'.repeat(64) })
    const [url] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/support/conversations/${'a'.repeat(32)}/messages`)
  })

  it('postSupportMessage posts the body with the bearer token', async () => {
    fetch.mockImplementation(() =>
      jsonResponse(201, { ok: true, message: { id: 2, sender: 'visitor', body: 'more', ts: 1762128060 } })
    )
    const res = await postSupportMessage({ conversationId: 'a'.repeat(32), token: 'b'.repeat(64), body: 'more' })
    expect(res.data.message.id).toBe(2)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/support/conversations/${'a'.repeat(32)}/messages`)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json', 'x-support-token': 'b'.repeat(64) })
    expect(JSON.parse(init.body)).toEqual({ body: 'more' })
  })

  it('postSupportGuru posts the guru slug with the bearer token, dropping an undefined account number', async () => {
    fetch.mockImplementation(() => jsonResponse(202, { ok: true }))
    const res = await postSupportGuru({ conversationId: 'a'.repeat(32), token: 'b'.repeat(64), guru: 'sage', accountNumber: undefined })
    expect(res.ok).toBe(true)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/support/conversations/${'a'.repeat(32)}/guru`)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json', 'x-support-token': 'b'.repeat(64) })
    expect(JSON.parse(init.body)).toEqual({ guru: 'sage' })
  })

  it('postSupportGuru sends the account number for elder turns', async () => {
    fetch.mockImplementation(() => jsonResponse(202, { ok: true }))
    await postSupportGuru({ conversationId: 'a'.repeat(32), token: 'b'.repeat(64), guru: 'elder', accountNumber: '1234567890123456' })
    const [, init] = fetch.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ guru: 'elder', account_number: '1234567890123456' })
  })

  it('postSupportGuruQuote posts guru=elder + account number to the quote endpoint', async () => {
    fetch.mockImplementation(() =>
      jsonResponse(200, { ok: true, quoteUsd: '0.058650', balanceUsd: '1.000000', sufficient: true, maxInputTokens: 12000, maxOutputTokens: 1000 })
    )
    const res = await postSupportGuruQuote({ conversationId: 'a'.repeat(32), token: 'b'.repeat(64), accountNumber: '1234567890123456' })
    expect(res.ok).toBe(true)
    expect(res.data.quoteUsd).toBe('0.058650')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/support/conversations/${'a'.repeat(32)}/guru/quote`)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json', 'x-support-token': 'b'.repeat(64) })
    expect(JSON.parse(init.body)).toEqual({ guru: 'elder', account_number: '1234567890123456' })
  })

  it('postSupportEscalate posts an empty body with the bearer token', async () => {
    fetch.mockImplementation(() => jsonResponse(200, { ok: true, escalated: true }))
    const res = await postSupportEscalate({ conversationId: 'a'.repeat(32), token: 'b'.repeat(64) })
    expect(res.ok).toBe(true)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/support/conversations/${'a'.repeat(32)}/escalate`)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'x-support-token': 'b'.repeat(64) })
    expect(init.body).toBeUndefined()
  })

  it('handles non-JSON responses gracefully', async () => {
    fetch.mockImplementation(() => Promise.resolve(new Response('<html>error</html>', { status: 500 })))
    const res = await createAccount()
    expect(res.ok).toBe(false)
    expect(res.status).toBe(500)
    expect(res.data).toBeNull()
  })
})
