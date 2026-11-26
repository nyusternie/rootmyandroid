// src/scripts/harness.ts — /harness page logic (framework-free).
//
// Device picker: the account's real paired devices
// (POST /v1/relay/devices/list — the same route /terminal uses).
// Agent registry: the latest `harness-agents` audit snapshot
// (POST /v1/device/audit/list — the same pipeline Guardian Angel uses for
// its app inventory). Until the device app writes one, the page keeps the
// labeled HARNESS_SAMPLE and says exactly that. No new API route is needed
// for this first version; the live-heartbeat route is the next step
// (docs/HANDOFF-2026-11-26-harness-page.md).
//
// Everything rendered here is registry metadata. The page never reads
// prompts, completions, chat history, model weights, files, or shell output.

import { listDeviceAudits, listRelayDevices } from '../lib/api.js'
import {
  HARNESS_SAMPLE,
  formatContext,
  formatGiB,
  formatStamp,
  memoryBudget,
  parseHarnessSnapshot,
  statusLabel,
  type HarnessAgentStatus,
  type HarnessSnapshot,
} from '../lib/harness.js'

const LS_ACCOUNT = 'rma.harness.account'
const LS_DEVICE = 'rma.harness.device'
const AUDIT_TYPE = 'harness-agents'

/** Same display format as the API: digits grouped in 4s. */
function formatAccountNumber(input: string): string {
  return input.replace(/[^0-9]/g, '').replace(/(.{4})(?=.)/g, '$1 ')
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id}`)
  return found as T
}

const statusTone: Record<HarnessAgentStatus, string> = {
  running: 'border-ok/45 bg-ok/12 text-ok-ink',
  idle: 'border-warn/45 bg-warn/12 text-warn-ink',
  stopped: 'border-line bg-inset text-faint',
}

const badgeTone = {
  sample: 'border-warn/45 bg-warn/12 text-warn-ink',
  device: 'border-ok/45 bg-ok/12 text-ok-ink',
  none: 'border-line bg-inset text-faint',
}

document.addEventListener('DOMContentLoaded', () => {
  const accountInput = el<HTMLInputElement>('account-number')
  const deviceSelect = el<HTMLSelectElement>('device-select')
  const loadBtn = el<HTMLButtonElement>('load-devices-btn')
  const syncBtn = el<HTMLButtonElement>('sync-btn')
  const demoBtn = el<HTMLButtonElement>('demo-btn')
  const statusEl = el<HTMLParagraphElement>('sync-status')
  const sourceEl = el<HTMLParagraphElement>('sync-source')
  const badgeEl = el<HTMLSpanElement>('snapshot-badge')
  const noteEl = el<HTMLParagraphElement>('snapshot-note')
  const agentList = el<HTMLDivElement>('agent-list')
  const agentTemplate = el<HTMLTemplateElement>('agent-card-template')

  const fields = {
    deviceName: el<HTMLElement>('device-name'),
    deviceModel: el<HTMLElement>('device-model'),
    deviceTotalRam: el<HTMLElement>('device-total-ram'),
    deviceFreeRam: el<HTMLElement>('device-free-ram'),
    deviceThermal: el<HTMLElement>('device-thermal'),
    deviceBattery: el<HTMLElement>('device-battery'),
    runtimeName: el<HTMLElement>('runtime-name'),
    runtimeBackend: el<HTMLElement>('runtime-backend'),
    collectedAt: el<HTMLElement>('collected-at'),
    lastSync: el<HTMLElement>('last-sync'),
    statAgents: el<HTMLElement>('stat-agents'),
    statRunning: el<HTMLElement>('stat-running'),
    statFree: el<HTMLElement>('stat-free'),
    budgetUsed: el<HTMLElement>('budget-used'),
    budgetFree: el<HTMLElement>('budget-free'),
    budgetPct: el<HTMLElement>('budget-pct'),
    budgetHeadroom: el<HTMLElement>('budget-headroom'),
    budgetFill: el<HTMLElement>('budget-fill'),
  }

  let loadedAccount = ''
  let loadingAccount = ''
  let autoLoadTimer = 0

  function setStatus(text: string, tone: 'ok' | 'warn' | 'muted'): void {
    statusEl.textContent = text
    statusEl.className =
      tone === 'ok'
        ? 'text-[1.15rem] text-ok'
        : tone === 'warn'
          ? 'text-[1.15rem] text-warn'
          : 'text-[1.15rem] text-body'
  }

  function setSource(text: string): void {
    sourceEl.textContent = text
  }

  function setBadge(text: string, tone: keyof typeof badgeTone): void {
    badgeEl.textContent = text
    badgeEl.className = `shrink-0 rounded-full border px-[0.6rem] py-[0.15rem] text-[0.72rem] font-bold tracking-[0.08em] ${badgeTone[tone]}`
  }

  function setField(node: HTMLElement, value: string): void {
    node.textContent = value
  }

  function renderAgents(snapshot: HarnessSnapshot): void {
    agentList.replaceChildren()
    for (const agent of snapshot.agents) {
      const fragment = agentTemplate.content.cloneNode(true) as DocumentFragment
      const card = fragment.querySelector('article')
      if (!card) continue
      const set = (field: string, value: string): void => {
        const node = card.querySelector(`[data-field="${field}"]`)
        if (node) node.textContent = value
      }
      set('name', agent.name)
      set('runtime', `${agent.runtime} · ${agent.id}`)
      set('model', agent.model)
      set('quant', agent.quantization)
      set('params', `${agent.parameters_b.toFixed(2)}B`)
      set('context', formatContext(agent.context))
      set('weights', formatGiB(agent.model_gib))
      set(
        'resident',
        agent.resident_gib > 0 ? formatGiB(agent.resident_gib) : 'not resident',
      )
      set('endpoint', agent.endpoint ?? '—')
      set('heartbeat', formatStamp(agent.last_heartbeat))
      const status = card.querySelector('[data-field="status"]')
      if (status) {
        status.textContent = statusLabel(agent.status)
        status.className = `shrink-0 rounded-full border px-[0.6rem] py-[0.15rem] text-[0.72rem] font-bold tracking-[0.08em] ${statusTone[agent.status]}`
      }
      const capabilities = card.querySelector('[data-field="capabilities"]')
      if (capabilities) {
        for (const capability of agent.capabilities) {
          const chip = document.createElement('span')
          chip.className =
            'rounded-[2rem] border border-line bg-inset px-[0.7rem] py-[0.2rem] font-mono text-[0.8rem] text-dim'
          chip.textContent = capability
          capabilities.appendChild(chip)
        }
      }
      agentList.appendChild(fragment)
    }
  }

  function renderSnapshot(snapshot: HarnessSnapshot, source: 'sample' | 'device'): void {
    const budget = memoryBudget(snapshot)
    const running = snapshot.agents.filter((agent) => agent.status === 'running').length

    setField(fields.deviceName, snapshot.device.name)
    setField(
      fields.deviceModel,
      `${snapshot.device.model} · ${snapshot.device.android}`,
    )
    setField(fields.deviceTotalRam, formatGiB(snapshot.device.total_ram_gib))
    setField(fields.deviceFreeRam, formatGiB(snapshot.device.free_ram_gib))
    setField(fields.deviceThermal, snapshot.device.thermal)
    setField(fields.deviceBattery, `${snapshot.device.battery_pct}%`)
    setField(
      fields.runtimeName,
      `${snapshot.runtime.name} ${snapshot.runtime.version}`,
    )
    setField(
      fields.runtimeBackend,
      `${snapshot.runtime.backend} · ${snapshot.runtime.threads} threads`,
    )
    setField(fields.collectedAt, formatStamp(snapshot.collected_at))
    setField(fields.lastSync, formatStamp(snapshot.device.last_sync))

    setField(fields.statAgents, String(snapshot.agents.length))
    setField(fields.statRunning, String(running))
    setField(fields.statFree, formatGiB(snapshot.device.free_ram_gib))

    setField(fields.budgetUsed, formatGiB(budget.residentGiB))
    setField(fields.budgetFree, formatGiB(budget.freeGiB))
    setField(fields.budgetPct, `${budget.usedPct}%`)
    setField(fields.budgetHeadroom, formatGiB(budget.headroomGiB))
    fields.budgetFill.style.setProperty('--bar-w', `${budget.usedPct}%`)

    if (source === 'sample') {
      setBadge('SAMPLE', 'sample')
      noteEl.textContent =
        'Labeled sample snapshot — not a read from your device. The device picker above uses the real paired-device list; the registry switches to a real snapshot when the device app writes one.'
    } else {
      setBadge('LIVE SNAPSHOT', 'device')
      noteEl.textContent = `Read-only snapshot collected ${formatStamp(snapshot.collected_at)}. No prompts, completions, or model weights are included.`
    }

    renderAgents(snapshot)
  }

  function setDeviceOptions(
    devices: Array<{ device_id?: string; device_name?: string }>,
  ): void {
    deviceSelect.replaceChildren()
    const seen = new Set<string>()
    for (const device of devices) {
      const id = String(device.device_id ?? '').toLowerCase()
      if (!/^[0-9a-f]{64}$/.test(id) || seen.has(id)) continue
      seen.add(id)
      const option = document.createElement('option')
      option.value = id
      option.textContent = `${device.device_name || 'Rootz device'} — ${id.slice(0, 8)}…`
      deviceSelect.appendChild(option)
    }
    if (!deviceSelect.options.length) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'No devices paired to this account yet'
      deviceSelect.appendChild(option)
      return
    }
    const stored = localStorage.getItem(LS_DEVICE) ?? ''
    deviceSelect.value = seen.has(stored) ? stored : deviceSelect.options[0].value
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
      const res = await listRelayDevices(account)
      const devices = res.ok ? (res.data?.devices ?? []) : []
      if (res.ok) {
        setDeviceOptions(devices)
        loadedAccount = account
        localStorage.setItem(LS_ACCOUNT, formatAccountNumber(account))
        setStatus(
          devices.length
            ? `Loaded ${devices.length} device${devices.length === 1 ? '' : 's'} — pick one and press Sync agents.`
            : 'No devices paired to this account yet — pair one in the Rootz app.',
          devices.length ? 'ok' : 'warn',
        )
      } else if (res.status === 404) {
        loadedAccount = ''
        setDeviceOptions([])
        setStatus('Account not found — check the 16-digit number.', 'warn')
      } else if (res.status === 429) {
        loadedAccount = ''
        setStatus('Too many device-list requests — wait a minute, then retry.', 'warn')
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

  async function syncAgents(): Promise<void> {
    const account = accountInput.value.replace(/[^0-9]/g, '')
    const deviceId = deviceSelect.value.trim().toLowerCase()
    if (account.length !== 16) {
      setStatus('Enter your 16-digit account number first.', 'warn')
      return
    }
    if (!/^[0-9a-f]{64}$/.test(deviceId)) {
      setStatus('Pick a device from the list first.', 'warn')
      return
    }
    syncBtn.disabled = true
    setStatus('Reading the latest harness snapshot…', 'muted')
    try {
      const res = await listDeviceAudits(account, AUDIT_TYPE)
      if (!res.ok) {
        if (res.status === 404) {
          setStatus('Account not found — check the 16-digit number.', 'warn')
        } else if (res.status === 429) {
          setStatus('Too many snapshot requests — wait a minute, then retry.', 'warn')
        } else {
          setStatus('Could not read the snapshot. Retry in a moment.', 'warn')
        }
        return
      }
      const row = (res.data?.audits ?? []).find(
        (audit: { device_id?: string }) => audit.device_id === deviceId,
      )
      const snapshot = parseHarnessSnapshot(row?.snapshot)
      if (!snapshot) {
        renderSnapshot(HARNESS_SAMPLE, 'sample')
        setBadge('SAMPLE · NO DEVICE SNAPSHOT', 'none')
        noteEl.textContent =
          'No harness snapshot for this device yet. The registry below is the labeled sample, not a read from your device — the device app writes one on its next sync.'
        setStatus(
          'No harness snapshot for this device yet — showing the labeled sample.',
          'warn',
        )
        setSource('No prompts, completions, or model weights are read by this page.')
        return
      }
      localStorage.setItem(LS_DEVICE, deviceId)
      renderSnapshot(snapshot, 'device')
      setStatus('Snapshot synced from your device.', 'ok')
      setSource(
        `Read-only audit snapshot · collected ${formatStamp(snapshot.collected_at)}`,
      )
    } catch {
      setStatus('Network error while reading the snapshot.', 'warn')
    } finally {
      syncBtn.disabled = false
    }
  }

  function loadSample(): void {
    renderSnapshot(HARNESS_SAMPLE, 'sample')
    setStatus('Sample snapshot loaded — not read from your device.', 'muted')
    setSource('Sample data · no account request was made')
  }

  const storedAccount = localStorage.getItem(LS_ACCOUNT) ?? ''
  accountInput.value = storedAccount
  renderSnapshot(HARNESS_SAMPLE, 'sample')
  if (storedAccount.replace(/[^0-9]/g, '').length === 16) {
    void loadDevices()
  } else {
    setDeviceOptions([])
  }

  // Auto-load the moment the number is complete (same 450 ms debounce as
  // /terminal and /guardian — one request per completed number).
  accountInput.addEventListener('input', () => {
    window.clearTimeout(autoLoadTimer)
    const digits = accountInput.value.replace(/[^0-9]/g, '')
    if (digits.length !== 16) {
      if (loadedAccount && digits !== loadedAccount) {
        loadedAccount = ''
        setDeviceOptions([])
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

  syncBtn.addEventListener('click', () => {
    void syncAgents()
  })

  demoBtn.addEventListener('click', loadSample)
})
