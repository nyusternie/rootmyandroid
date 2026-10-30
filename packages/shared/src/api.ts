// packages/shared/src/api.ts — thin typed client for the Root My Android
// API (rootmyandroid.com/v1). TypeScript port of apps/web/src/lib/api.js —
// keep the two in lockstep so web and mobile always speak the same API.
// Auth model: the Mullvad-style account number travels in the request body
// (never a header/token); the API is otherwise unauthenticated.

// Default to the production API. Apps override for local dev with
// setApiBase('http://<host>:8787/v1') before any call.
const DEFAULT_BASE = 'https://rootmyandroid.com/v1';

let baseOverride: string | null = null;

export function setApiBase(base: string): void {
  baseOverride = base.replace(/\/$/, '');
}

export function apiBase(): string {
  return baseOverride ?? DEFAULT_BASE;
}

export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
}

async function request<T>(
  path: string,
  { method = 'GET', body }: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    /* non-JSON body */
  }
  return { ok: res.ok, status: res.status, data };
}

export function createAccount() {
  return request('/accounts', { method: 'POST' });
}

export function getAccount(accountNumber: string) {
  return request(`/accounts/${encodeURIComponent(accountNumber)}`);
}

export function createCheckout({ accountNumber, plan }: { accountNumber: string; plan: string }) {
  return request('/billing/checkout', {
    method: 'POST',
    body: { account_number: accountNumber, plan },
  });
}

export function createCryptoCheckout({ accountNumber, plan }: { accountNumber: string; plan: string }) {
  return request('/billing/crypto/checkout', {
    method: 'POST',
    body: { account_number: accountNumber, plan },
  });
}

// POST /billing/nitro/checkout — buy a Nitro pack on the card rail
// (NOWPayments). Pack ids are server-defined (nitro_100 / nitro_500 /
// nitro_1000); prices are enforced server-side.
export function createNitroCheckout({ accountNumber, pack }: { accountNumber: string; pack: string }) {
  return request('/billing/nitro/checkout', {
    method: 'POST',
    body: { account_number: accountNumber, pack },
  });
}

// POST /billing/nitro/crypto/checkout — buy a Nitro pack on the crypto rail
// (BTCPay: BTC / Lightning).
export function createNitroCryptoCheckout({ accountNumber, pack }: { accountNumber: string; pack: string }) {
  return request('/billing/nitro/crypto/checkout', {
    method: 'POST',
    body: { account_number: accountNumber, pack },
  });
}

// POST /billing/nitro/payment — buy a Nitro pack on the whitelabel rail:
// the API returns a deposit address + amount in the chosen coin, and the
// client renders the checkout UI itself (no hosted page, no redirect).
export function createNitroPayment({
  accountNumber,
  pack,
  payCurrency,
}: {
  accountNumber: string;
  pack: string;
  payCurrency: string;
}) {
  return request('/billing/nitro/payment', {
    method: 'POST',
    body: { account_number: accountNumber, pack, pay_currency: payCurrency },
  });
}

// GET /billing/payment/{id} — poll a whitelabel payment's status while the
// deposit panel is open (waiting -> confirming -> finished).
export function getPaymentStatus(paymentId: string) {
  return request(`/billing/payment/${encodeURIComponent(paymentId)}`);
}

// POST /nitro — an account's Nitro balance plus its recent ledger entries.
// (POST so the account number travels in the body, not the URL/logs.)
export function getNitroBalance(accountNumber: string) {
  return request('/nitro', {
    method: 'POST',
    body: { account_number: accountNumber },
  });
}

// GET /nitro/services — public catalog of PRO services + Nitro prices, so
// clients render pricing from the server-side table instead of hard-coding.
export function getNitroServices() {
  return request('/nitro/services');
}

// POST /redeem — redeem a single-use voucher code, crediting its Nitro to
// the account. Codes are single-use; a redeemed code returns 409.
export function redeemCode({ accountNumber, code }: { accountNumber: string; code: string }) {
  return request('/redeem', {
    method: 'POST',
    body: { account_number: accountNumber, code },
  });
}

// GET /device/whoami — the caller's network identity echoed from edge
// metadata. Used by the /audit live scan.
export function whoami() {
  return request('/device/whoami');
}

// POST /device/audit — store an audit snapshot (audit_type classifies the
// audit: "device" for the web live scan, "backup" for the Rooted app's
// backup coverage, ...). Undefined fields are dropped by JSON.stringify.
export function saveAudit({
  accountNumber,
  deviceId,
  auditType,
  deviceName,
  collectedAt,
  snapshot,
}: {
  accountNumber: string;
  deviceId: string;
  auditType: string;
  deviceName?: string;
  collectedAt: string;
  snapshot: unknown;
}) {
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
  });
}

// POST /device/audit/list — latest audit snapshot per device for an account,
// optionally restricted to one audit class.
export function listAudits({ accountNumber, auditType }: { accountNumber: string; auditType?: string }) {
  return request('/device/audit/list', {
    method: 'POST',
    body: { account_number: accountNumber, audit_type: auditType },
  });
}
