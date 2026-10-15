// src/lib/api.test.js
import { afterEach, describe, expect, it, vi } from 'vitest'

import { API_BASE_URL, createAccount, createCheckout, getAccount } from '@/lib/api'

function mockFetchOnce(response, { status = 200 } = {}) {
  return vi.fn(async () =>
    new Response(JSON.stringify(response), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api client', () => {
  it('targets the configured base URL', () => {
    expect(typeof API_BASE_URL).toBe('string')
    expect(API_BASE_URL).not.toMatch(/\/$/)
  })

  it('createAccount POSTs to /accounts', async () => {
    const fetchMock = mockFetchOnce({ ok: true, account_number: '1234 5678 9012 3456', credit_days: 0 }, { status: 201 })
    vi.stubGlobal('fetch', fetchMock)

    const res = await createAccount()
    expect(res.ok).toBe(true)
    expect(res.data.account_number).toBe('1234 5678 9012 3456')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/accounts`)
    expect(init.method).toBe('POST')
  })

  it('getAccount encodes the account number in the path', async () => {
    const fetchMock = mockFetchOnce({ ok: true, credit_days: 30 })
    vi.stubGlobal('fetch', fetchMock)

    await getAccount('1234 5678 9012 3456')
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/accounts/1234%205678%209012%203456`)
  })

  it('createCheckout POSTs account + plan and returns the invoice url', async () => {
    const fetchMock = mockFetchOnce({ ok: true, invoice_url: 'https://nowpayments.io/payment/?iid=1' })
    vi.stubGlobal('fetch', fetchMock)

    const res = await createCheckout({ accountNumber: '1234567890123456', plan: 'monthly' })
    expect(res.ok).toBe(true)
    expect(res.data.invoice_url).toContain('nowpayments.io')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/billing/checkout`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ account_number: '1234567890123456', plan: 'monthly' })
  })

  it('surfaces non-OK responses with status and parsed error body', async () => {
    const fetchMock = mockFetchOnce({ ok: false, error: 'account_not_found' }, { status: 404 })
    vi.stubGlobal('fetch', fetchMock)

    const res = await getAccount('9999999999999999')
    expect(res.ok).toBe(false)
    expect(res.status).toBe(404)
    expect(res.data.error).toBe('account_not_found')
  })

  it('returns data:null when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 500 })))
    const res = await createAccount()
    expect(res.ok).toBe(false)
    expect(res.status).toBe(500)
    expect(res.data).toBeNull()
  })
})
