// src/lib/api.js — thin client for the Root My Android API (rootmyandroid.com/v1).
// Plain browser JS — no framework. Used by the /account page's inline script
// and unit-tested with Vitest.

// Default to the production API. Override for local dev by serving the site
// with a <meta name="rma-api-base" content="http://localhost:8787/v1"> or by
// setting window.__RMA_API_BASE__ before the account script runs.
const DEFAULT_BASE = 'https://rootmyandroid.com/v1'

export function apiBase() {
  if (typeof window !== 'undefined' && window.__RMA_API_BASE__) {
    return window.__RMA_API_BASE__.replace(/\/$/, '')
  }
  return DEFAULT_BASE
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON body */
  }
  return { ok: res.ok, status: res.status, data }
}

export function createAccount() {
  return request('/accounts', { method: 'POST' })
}

export function getAccount(accountNumber) {
  return request(`/accounts/${encodeURIComponent(accountNumber)}`)
}

export function createCheckout({ accountNumber, plan }) {
  return request('/billing/checkout', {
    method: 'POST',
    body: { account_number: accountNumber, plan },
  })
}

export function createCryptoCheckout({ accountNumber, plan }) {
  return request('/billing/crypto/checkout', {
    method: 'POST',
    body: { account_number: accountNumber, plan },
  })
}
