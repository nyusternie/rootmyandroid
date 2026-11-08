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

async function request(path, { method = 'GET', body, headers } = {}) {
  const allHeaders = { ...headers }
  if (body) allHeaders['content-type'] = 'application/json'
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: Object.keys(allHeaders).length ? allHeaders : undefined,
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

// GET /billing/payment/{id} — poll a whitelabel payment's status while the
// deposit panel is open (waiting -> confirming -> finished).
export function getPaymentStatus(paymentId) {
  return request(`/billing/payment/${encodeURIComponent(paymentId)}`)
}

// POST /redeem — redeem a single-use voucher code, crediting its plan time
// to the account. Codes are single-use; a redeemed code returns 409.
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
// audit: "device" for the web live scan, "backup" for the Rootz app's
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

// --- Support conversations (visitor side; wire contract + token model: ----
// rootmyandroid-api src/lib/support.js). Anonymous: creating a conversation
// returns a one-time 64-hex bearer token, presented from then on in the
// x-support-token header (in the API's CORS allow-headers).

// POST /support/conversations — open a conversation ('realtime' | 'message')
// with its first message. `email` is required iff mode='message' (stored
// unverified); `accountNumber` is optional and format-checked only.
// Undefined fields are dropped by JSON.stringify.
export function createSupportConversation({ mode, body, email, accountNumber }) {
  return request('/support/conversations', {
    method: 'POST',
    body: { mode, body, email, account_number: accountNumber },
  })
}

// GET /support/conversations/{id}/messages?after={msgId} — poll a thread.
// Omit `after` (or 0) for the full history, e.g. when resuming.
export function getSupportMessages({ conversationId, token, after }) {
  const suffix = after ? `?after=${after}` : ''
  return request(
    `/support/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`,
    { headers: { 'x-support-token': token } }
  )
}

// POST /support/conversations/{id}/messages — visitor follow-up message.
export function postSupportMessage({ conversationId, token, body }) {
  return request(
    `/support/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: 'POST', headers: { 'x-support-token': token }, body: { body } }
  )
}
