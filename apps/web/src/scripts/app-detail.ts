// src/scripts/app-detail.ts — the "Is it on your device?" block on
// /app/<package>. Framework-free, same shape as /guardian's picker: account
// number → devices paired to it → the app's record for the selected device.
//
// Everything here is client-side by design: the page itself is a static,
// indexable document about a package, and an indexed page must never reveal
// who has what installed. The answer comes from
// POST /v1/guardian/apps/get (docs/HANDOFF-2026-11-26-guardian-app-detail.md).
//
// The account number is the only credential — same model as /guardian and
// /terminal. It is remembered in localStorage so a returning visitor lands on
// their own device.

import { getGuardianApp, listGuardianDevices } from '../lib/api.js'

const LS_ACCOUNT = 'rma.guardian.account'
const LS_DEVICE = 'rma.guardian.device'

type GuardianDevice = {
  device_id?: string
  device_name?: string | null
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id}`)
  return found as T
}

/** ISO timestamp → "26 Nov 2026" (never a raw ISO string on the page). */
function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

document.addEventListener('DOMContentLoaded', () => {
  const facts = el<HTMLDListElement>('device-facts')
  const packageName = facts.dataset.package ?? ''
  const accountInput = el<HTMLInputElement>('device-account')
  const deviceSelect = el<HTMLSelectElement>('device-select')
  const statusEl = el<HTMLParagraphElement>('device-status')
  const factPresent = el<HTMLElement>('device-fact-present')
  const factVersion = el<HTMLElement>('device-fact-version')
  const factKind = el<HTMLElement>('device-fact-kind')
  const factShared = el<HTMLElement>('device-fact-shared')
  const factCount = el<HTMLElement>('device-fact-count')

  const storedAccount = localStorage.getItem(LS_ACCOUNT) ?? ''
  const storedDevice = localStorage.getItem(LS_DEVICE) ?? ''
  let loadedAccount = ''
  let loadingAccount = ''
  let autoLoadTimer = 0

  function setStatus(text: string, tone: 'ok' | 'warn' | 'muted'): void {
    statusEl.textContent = text
    statusEl.className =
      tone === 'ok'
        ? 'text-[1.05rem] text-ok'
        : tone === 'warn'
          ? 'text-[1.05rem] text-warn'
          : 'text-[1.05rem] text-body'
  }

  function showFacts(shown: boolean): void {
    facts.classList.toggle('hidden', !shown)
    facts.classList.toggle('grid', shown)
  }

  /** Ask the API for this package on the selected device. */
  async function loadApp(): Promise<void> {
    const account = loadedAccount || accountInput.value.replace(/[^0-9]/g, '')
    const deviceId = deviceSelect.value
    showFacts(false)
    if (!account || account.length !== 16 || !deviceId || !packageName) {
      setStatus('Enter your account number to check this package.', 'muted')
      return
    }
    setStatus('Checking the shared app list…', 'muted')
    try {
      const res = await getGuardianApp(account, deviceId, packageName)
      if (res.ok && res.data?.app) {
        const app = res.data.app as { version?: string | null; system?: boolean }
        factPresent.textContent = 'yes — in the list this device shared'
        factVersion.textContent = app.version || '—'
        factKind.textContent = app.system ? 'system app' : 'user-installed'
        factShared.textContent = formatDate(res.data?.collected_at)
        factCount.textContent = typeof res.data?.count === 'number' ? String(res.data.count) : '—'
        showFacts(true)
        setStatus(`Found on ${deviceSelect.options[deviceSelect.selectedIndex]?.textContent ?? 'this device'}.`, 'ok')
        return
      }
      const error = res.data?.error
      if (res.status === 404 && error === 'app_not_found') {
        setStatus(
          'Not in the app list this device shared. Either it is not installed, or the phone has not shared a fresh list — open Guardian Angel on the phone.',
          'warn',
        )
      } else if (res.status === 404 && error === 'not_found') {
        setStatus('The detail endpoint is not deployed yet — retry after the next API deploy.', 'warn')
      } else if (res.status === 404) {
        setStatus('The account or device was not found — check the number and try again.', 'warn')
      } else if (res.status === 429) {
        setStatus('Too many lookups — wait a minute, then try again.', 'warn')
      } else {
        setStatus('Could not check this package. Retry in a moment.', 'warn')
      }
    } catch {
      setStatus('Network error — the API is not reachable from this browser.', 'warn')
    }
  }

  function setDevices(list: GuardianDevice[]): void {
    deviceSelect.innerHTML = ''
    const seen = new Set<string>()
    for (const device of list) {
      const id = String(device.device_id ?? '')
      if (!id || seen.has(id)) continue
      seen.add(id)
      const option = document.createElement('option')
      option.value = id
      option.textContent = `${device.device_name || 'Guardian device'} — ${id.slice(0, 8)}…`
      deviceSelect.appendChild(option)
    }
    if (!deviceSelect.options.length) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'No devices on this account yet'
      deviceSelect.appendChild(option)
      return
    }
    deviceSelect.value = seen.has(storedDevice) ? storedDevice : deviceSelect.options[0].value
  }

  async function loadDevices(): Promise<void> {
    const account = accountInput.value.replace(/[^0-9]/g, '')
    if (account.length !== 16) {
      setStatus('Enter your 16-digit account number first.', 'warn')
      return
    }
    loadingAccount = account
    setStatus('Loading devices…', 'muted')
    try {
      const res = await listGuardianDevices(account)
      if (res.ok) {
        const list: GuardianDevice[] = res.data?.devices ?? []
        setDevices(list)
        loadedAccount = account
        localStorage.setItem(LS_ACCOUNT, account)
        if (deviceSelect.value) localStorage.setItem(LS_DEVICE, deviceSelect.value)
        void loadApp()
      } else if (res.status === 404 && res.data?.error === 'account_not_found') {
        loadedAccount = ''
        setStatus('Account not found — check the 16-digit number.', 'warn')
      } else if (res.status === 429) {
        loadedAccount = ''
        setStatus('Too many list requests — wait a minute, then retry.', 'warn')
      } else {
        loadedAccount = ''
        setStatus('Could not load devices. Retry in a moment.', 'warn')
      }
    } catch {
      loadedAccount = ''
      setStatus('Network error. Is the API reachable?', 'warn')
    } finally {
      loadingAccount = ''
    }
  }

  // One request per completed number (same 450 ms debounce as /guardian).
  accountInput.addEventListener('input', () => {
    window.clearTimeout(autoLoadTimer)
    const digits = accountInput.value.replace(/[^0-9]/g, '')
    if (digits.length !== 16) {
      if (loadedAccount && digits !== loadedAccount) {
        loadedAccount = ''
        setDevices([])
        showFacts(false)
        setStatus('Enter your 16-digit account number.', 'muted')
      }
      return
    }
    if (digits === loadedAccount || digits === loadingAccount) return
    autoLoadTimer = window.setTimeout(() => {
      void loadDevices()
    }, 450)
  })

  deviceSelect.addEventListener('change', () => {
    if (deviceSelect.value) localStorage.setItem(LS_DEVICE, deviceSelect.value)
    void loadApp()
  })

  // Returning visitor: land on their device without retyping anything.
  if (storedAccount.replace(/[^0-9]/g, '').length === 16) {
    accountInput.value = storedAccount
    void loadDevices()
  }
})
