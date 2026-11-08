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

export function createAccount<T = unknown>() {
  return request<T>('/accounts', { method: 'POST' });
}

export function getAccount<T = unknown>(accountNumber: string) {
  return request<T>(`/accounts/${encodeURIComponent(accountNumber)}`);
}

export function createCheckout<T = unknown>({ accountNumber, plan }: { accountNumber: string; plan: string }) {
  return request<T>('/billing/checkout', {
    method: 'POST',
    body: { account_number: accountNumber, plan },
  });
}

export function createCryptoCheckout<T = unknown>({ accountNumber, plan }: { accountNumber: string; plan: string }) {
  return request<T>('/billing/crypto/checkout', {
    method: 'POST',
    body: { account_number: accountNumber, plan },
  });
}

// GET /billing/payment/{id} — poll a whitelabel payment's status while the
// deposit panel is open (waiting -> confirming -> finished).
export function getPaymentStatus<T = unknown>(paymentId: string) {
  return request<T>(`/billing/payment/${encodeURIComponent(paymentId)}`);
}

// POST /redeem — redeem a single-use voucher code, crediting its plan time
// to the account. Codes are single-use; a redeemed code returns 409.
export function redeemCode<T = unknown>({ accountNumber, code }: { accountNumber: string; code: string }) {
  return request<T>('/redeem', {
    method: 'POST',
    body: { account_number: accountNumber, code },
  });
}

// GET /device/whoami — the caller's network identity echoed from edge
// metadata. Used by the /audit live scan.
export function whoami<T = unknown>() {
  return request<T>('/device/whoami');
}

// POST /device/audit — store an audit snapshot (audit_type classifies the
// audit: "device" for the web live scan, "backup" for the Rootz app's
// backup coverage, ...). Undefined fields are dropped by JSON.stringify.
export function saveAudit<T = unknown>({
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
  return request<T>('/device/audit', {
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
export function listAudits<T = unknown>({ accountNumber, auditType }: { accountNumber: string; auditType?: string }) {
  return request<T>('/device/audit/list', {
    method: 'POST',
    body: { account_number: accountNumber, audit_type: auditType },
  });
}
