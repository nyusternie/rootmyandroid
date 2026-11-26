// src/scripts/guardian.ts — /guardian page logic (framework-free).
//
// The Guardian Angel control page: account number → the devices paired to
// it → the selected device's details. The list comes from
// POST /v1/guardian/devices/list (contract:
// docs/HANDOFF-2026-11-25-guardian-device-list.md). Until the API team
// ships that route the call answers 404 not_found, and the page says so
// instead of pretending the account has no devices.
//
// Nothing here touches a phone: pairing, protection and the launcher icon
// are on-device actions in the Guardian Angel app.

import { listDeviceAudits, listGuardianDevices } from '../lib/api.js'

const LS_ACCOUNT = 'rma.guardian.account'
const LS_DEVICE = 'rma.guardian.device'

type GuardianDevice = {
  device_id?: string
  device_name?: string | null
  created_at?: string
}

type InstalledApp = {
  package?: string
  label?: string
  version?: string
  system?: boolean
}

/** The installed-app snapshot the app uploads (audit_type guardian_apps). */
type AppsSnapshot = {
  count?: number
  collected_at?: string
  apps?: InstalledApp[]
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id}`)
  return found as T
}

/** "3f2a9c1e-…" → "3f2a9c1e…" (UUIDs are long; the picker stays readable). */
function shortId(id: string): string {
  return `${id.slice(0, 8)}…`
}

/** ISO timestamp → "25 Nov 2026" (the page never shows a raw ISO string). */
function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

document.addEventListener('DOMContentLoaded', () => {
  const accountInput = el<HTMLInputElement>('account-number')
  const deviceSelect = el<HTMLSelectElement>('device-select')
  const loadBtn = el<HTMLButtonElement>('load-devices-btn')
  const statusEl = el<HTMLParagraphElement>('conn-status')
  const infoName = el<HTMLElement>('devinfo-name')
  const infoPaired = el<HTMLElement>('devinfo-paired')
  const infoId = el<HTMLElement>('devinfo-id')
  const appsFilter = el<HTMLInputElement>('apps-filter')
  const appsRefresh = el<HTMLButtonElement>('apps-refresh')
  const appsStatus = el<HTMLParagraphElement>('apps-status')
  const appsList = el<HTMLUListElement>('apps-list')

  let devices: GuardianDevice[] = []
  let apps: InstalledApp[] = []
  let loadedAccount = ''
  // Account whose request is in flight (prevents duplicate auto-loads).
  let loadingAccount = ''
  let autoLoadTimer = 0

  const storedAccount = localStorage.getItem(LS_ACCOUNT) ?? ''
  const storedDevice = localStorage.getItem(LS_DEVICE) ?? ''
  accountInput.value = storedAccount

  function setAppsStatus(text: string, tone: 'ok' | 'warn' | 'muted'): void {
    appsStatus.textContent = text
    appsStatus.className =
      tone === 'ok'
        ? 'text-[1.05rem] text-ok'
        : tone === 'warn'
          ? 'text-[1.05rem] text-warn'
          : 'text-[1.05rem] text-body'
  }

  /** Render the shared app list, honouring the filter box. */
  function renderApps(): void {
    const needle = appsFilter.value.trim().toLowerCase()
    appsList.innerHTML = ''
    const shown = apps.filter((app) => {
      if (!needle) return true
      return (
        (app.label ?? '').toLowerCase().includes(needle) ||
        (app.package ?? '').toLowerCase().includes(needle)
      )
    })
    for (const app of shown) {
      const li = document.createElement('li')
      li.className =
        'flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line py-[0.35rem]'
      const name = document.createElement('span')
      name.className = 'text-body text-[1rem]'
      name.textContent = app.label || app.package || '(unnamed)'
      const meta = document.createElement('span')
      meta.className = 'text-faint text-[0.85rem]'
      meta.textContent = `${app.package ?? ''}${app.system ? ' · system' : ''}`
      li.append(name, meta)
      appsList.appendChild(li)
    }
    if (!shown.length) {
      const li = document.createElement('li')
      li.className = 'text-faint text-[0.95rem] py-2'
      li.textContent = apps.length ? 'No app matches that filter.' : ''
      appsList.appendChild(li)
    }
  }

  /** Load the selected device's app inventory (audit_type guardian_apps). */
  async function loadApps(): Promise<void> {
    const account = loadedAccount || accountInput.value.replace(/[^0-9]/g, '')
    const deviceId = deviceSelect.value
    apps = []
    renderApps()
    if (!account || account.length !== 16 || !deviceId) {
      setAppsStatus('Pick a device above.', 'muted')
      return
    }
    setAppsStatus('Loading the shared app list…', 'muted')
    try {
      const res = await listDeviceAudits(account, 'guardian-apps')
      if (!res.ok) {
        setAppsStatus('Could not load the app list. Retry in a moment.', 'warn')
        return
      }
      const row = (res.data?.audits ?? []).find(
        (audit: { device_id?: string }) => audit.device_id === deviceId,
      )
      const snapshot: AppsSnapshot | undefined = row?.snapshot
      apps = Array.isArray(snapshot?.apps) ? snapshot!.apps! : []
      if (!apps.length) {
        setAppsStatus(
          'No app list shared yet — open Guardian Angel on the phone (it shares one per launch).',
          'warn',
        )
        return
      }
      const when = formatDate(snapshot?.collected_at)
      setAppsStatus(`${apps.length} apps · shared ${when}`, 'ok')
      renderApps()
    } catch {
      setAppsStatus('Network error while loading the app list.', 'warn')
    }
  }

  function setStatus(text: string, tone: 'ok' | 'warn' | 'muted'): void {
    statusEl.textContent = text
    statusEl.className =
      tone === 'ok'
        ? 'text-[1.15rem] text-ok'
        : tone === 'warn'
          ? 'text-[1.15rem] text-warn'
          : 'text-[1.15rem] text-body'
  }

  function option(value: string, label: string): HTMLOptionElement {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    return opt
  }

  function showDevice(device: GuardianDevice | null): void {
    infoName.textContent = device?.device_name || (device ? 'Unnamed device' : '—')
    infoPaired.textContent = formatDate(device?.created_at)
    infoId.textContent = device?.device_id || '—'
    if (device?.device_id) localStorage.setItem(LS_DEVICE, device.device_id)
  }

  /** Fill the picker; selection order: the last device used here, else the
   *  first row. */
  function setDevices(list: GuardianDevice[]): void {
    devices = list
    deviceSelect.innerHTML = ''
    const seen = new Set<string>()
    for (const device of list) {
      const id = String(device.device_id ?? '')
      if (!id || seen.has(id)) continue
      seen.add(id)
      const name = device.device_name || 'Guardian device'
      deviceSelect.appendChild(option(id, `${name} — ${shortId(id)}`))
    }
    if (!deviceSelect.options.length) {
      deviceSelect.appendChild(option('', 'No devices on this account yet'))
      showDevice(null)
      return
    }
    const preferred = [storedDevice].find((id) => id && seen.has(id))
    deviceSelect.value = preferred ?? deviceSelect.options[0].value
    showDevice(list.find((d) => d.device_id === deviceSelect.value) ?? null)
  }

  async function loadDevices(): Promise<void> {
    const account = accountInput.value.replace(/[^0-9]/g, '')
    if (account.length !== 16) {
      setStatus('Enter your 16-digit account number first.', 'warn')
      return
    }
    loadBtn.disabled = true
    loadingAccount = account
    setStatus('Loading devices…', 'muted')
    try {
      const res = await listGuardianDevices(account)
      if (res.ok) {
        const list: GuardianDevice[] = res.data?.devices ?? []
        setDevices(list)
        loadedAccount = account
        localStorage.setItem(LS_ACCOUNT, account)
        void loadApps()
        setStatus(
          list.length === 1
            ? 'Device loaded — see below.'
            : list.length
              ? `Loaded ${list.length} devices — pick one below.`
              : 'No devices on this account yet — sync one in the Guardian Angel app.',
          list.length ? 'ok' : 'warn',
        )
      } else if (res.status === 404 && res.data?.error === 'account_not_found') {
        loadedAccount = ''
        setDevices([])
        setStatus('Account not found — check the 16-digit number.', 'warn')
      } else if (res.status === 429) {
        loadedAccount = ''
        setStatus('Too many list requests — wait a minute, then retry.', 'warn')
      } else if (res.status === 404) {
        loadedAccount = ''
        // A 404 WITHOUT account_not_found means the route itself is missing
        // (rollback, wrong host). The route shipped 2026-11-25
        // (docs/HANDOFF-REPLY-2026-11-25-guardian-device-list.md).
        loadedAccount = ''
        setDevices([])
        setStatus(
          'Device list unavailable — the API answered 404. Retry after the next deploy.',
          'warn',
        )
      } else {
        loadedAccount = ''
        setStatus('Could not load devices. Retry in a moment.', 'warn')
      }
    } catch {
      loadedAccount = ''
      setStatus('Network error. Is the API reachable?', 'warn')
    } finally {
      loadingAccount = ''
      loadBtn.disabled = false
    }
  }

  // Auto-load the moment the number is complete (same behaviour as
  // /terminal): one request per completed number, 450 ms debounce.
  accountInput.addEventListener('input', () => {
    window.clearTimeout(autoLoadTimer)
    const digits = accountInput.value.replace(/[^0-9]/g, '')
    if (digits.length !== 16) {
      if (loadedAccount && digits !== loadedAccount) {
        loadedAccount = ''
        setDevices([])
        setStatus('Enter your 16-digit account number.', 'muted')
      }
      return
    }
    if (digits === loadedAccount || digits === loadingAccount) return
    autoLoadTimer = window.setTimeout(() => {
      void loadDevices()
    }, 450)
  })

  loadBtn.addEventListener('click', () => {
    void loadDevices()
  })

  deviceSelect.addEventListener('change', () => {
    showDevice(devices.find((d) => d.device_id === deviceSelect.value) ?? null)
    void loadApps()
  })

  appsFilter.addEventListener('input', () => {
    renderApps()
    if (apps.length) {
      setAppsStatus(`${apps.length} apps · filter: ${appsFilter.value.trim() || 'none'}`, 'ok')
    }
  })

  appsRefresh.addEventListener('click', () => {
    void loadApps()
  })

  // Returning user: one request on load, so the page lands on their device.
  if (storedAccount.replace(/[^0-9]/g, '').length === 16) {
    void loadDevices()
  } else {
    setDevices([])
  }
})
