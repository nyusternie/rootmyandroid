// src/lib/api.js — client for the rootmyandroid-api worker (/v1).
//
// Base URL is configurable via NEXT_PUBLIC_API_BASE_URL so we can point the
// static site at a local `wrangler dev` during development.

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://rootmyandroid.com/v1'

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { ok: res.ok, status: res.status, data }
}

/** Create a new Mullvad-style account. Returns { account_number, credit_days }. */
export async function createAccount() {
  return request('/accounts', { method: 'POST' })
}

/** Look up an account by number (raw or formatted). */
export async function getAccount(accountNumber) {
  return request(`/accounts/${encodeURIComponent(accountNumber)}`)
}

/** Create a hosted checkout (NOWPayments invoice). Returns { invoice_url, ... }. */
export async function createCheckout({ accountNumber, plan }) {
  return request('/billing/checkout', {
    method: 'POST',
    body: { account_number: accountNumber, plan },
  })
}
