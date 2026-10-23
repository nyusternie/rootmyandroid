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

// POST /billing/nitro/checkout — buy a Nitro pack on the card rail
// (NOWPayments). Pack ids are server-defined (nitro_100 / nitro_500 /
// nitro_1000); prices are enforced server-side.
export function createNitroCheckout({ accountNumber, pack }) {
  return request('/billing/nitro/checkout', {
    method: 'POST',
    body: { account_number: accountNumber, pack },
  })
}

// POST /billing/nitro/crypto/checkout — buy a Nitro pack on the crypto rail
// (BTCPay: BTC / Lightning).
export function createNitroCryptoCheckout({ accountNumber, pack }) {
  return request('/billing/nitro/crypto/checkout', {
    method: 'POST',
    body: { account_number: accountNumber, pack },
  })
}

// POST /billing/nitro/payment — buy a Nitro pack on the whitelabel rail:
// the API returns a deposit address + amount in the chosen coin, and the
// /account page renders the checkout UI itself (no hosted page, no redirect).
export function createNitroPayment({ accountNumber, pack, payCurrency }) {
  return request('/billing/nitro/payment', {
    method: 'POST',
    body: { account_number: accountNumber, pack, pay_currency: payCurrency },
  })
}

// GET /billing/payment/{id} — poll a whitelabel payment's status while the
// deposit panel is open (waiting -> confirming -> finished).
export function getPaymentStatus(paymentId) {
  return request(`/billing/payment/${encodeURIComponent(paymentId)}`)
}

// POST /nitro — an account's Nitro balance plus its recent ledger entries.
// (POST so the account number travels in the body, not the URL/logs.)
export function getNitroBalance(accountNumber) {
  return request('/nitro', {
    method: 'POST',
    body: { account_number: accountNumber },
  })
}

// POST /redeem — redeem a single-use voucher code, crediting its Nitro to
// the account. Codes are single-use; a redeemed code returns 409.
export function redeemCode({ accountNumber, code }) {
  return request('/redeem', {
    method: 'POST',
    body: { account_number: accountNumber, code },
  })
}

// GET /device/whoami — the caller's network identity echoed from edge
// metadata. Used by the /audit live scan.
export function whoami() {
  return request('/device/whoami')
}

// POST /device/audit — store an audit snapshot (audit_type classifies the
// audit: "device" for the web live scan, "backup" for the Rooted app's
// backup coverage, ...). Undefined fields are dropped by JSON.stringify.
export function saveAudit({ accountNumber, deviceId, auditType, deviceName, collectedAt, snapshot }) {
  return request('/device/audit', {
    method: 'POST',
    body: {
      account_number: accountNumber,
      device_id: deviceId,
      audit_type: auditType,
      device_name: deviceName,
      collected_at: collectedAt,
      snapshot,
    },
  })
}

// POST /device/audit/list — latest audit snapshot per device for an account,
// optionally restricted to one audit class.
export function listAudits({ accountNumber, auditType }) {
  return request('/device/audit/list', {
    method: 'POST',
    body: { account_number: accountNumber, audit_type: auditType },
  })
}
