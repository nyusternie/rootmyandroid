// src/scripts/audit.ts — /audit page logic (framework-free).
// Scans the device viewing the page in real time (browser signals plus the
// API's whoami edge echo) and renders the details on the page. Optionally
// saves the scan to an account number as audit class "device". Bundled by
// Astro and loaded as a module; the rest of the site ships zero JavaScript.
import { saveAudit, whoami } from '../lib/api.js'

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing element #${id}`)
  return el
}

const scanBtn = $('scan-btn') as HTMLButtonElement
const results = $('scan-results')
const notice = $('notice')
const error = $('error')
const saveForm = $('save-form')
const saveBtn = $('save-btn') as HTMLButtonElement
const accountInput = $('save-account-number') as HTMLInputElement
const deviceNameInput = $('save-device-name') as HTMLInputElement

const DEVICE_ID_KEY = 'rma_audit_device_id'

type Row = [string, string]

interface Snapshot {
  scanned_at: string
  user_agent: string
  browser: string
  os: string
  device_class: string
  languages: string[]
  timezone: string
  screen: { width: number; height: number; dpr: number; color_depth: number }
  viewport: { width: number; height: number }
  cores: number | null
  memory_gb: number | null
  touch_points: number
  gpu: string | null
  connection: {
    effective_type: string | null
    downlink_mbps: number | null
    rtt_ms: number | null
    save_data: boolean | null
  } | null
  battery: { level_pct: number; charging: boolean } | null
  storage: { usage_mb: number; quota_mb: number } | null
  cookies_enabled: boolean
  do_not_track: string | null
  edge: unknown
}

let lastSnapshot: Snapshot | null = null
let scanning = false

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string
  )
}

function renderRows(el: HTMLElement, rows: Row[]): void {
  el.innerHTML = rows
    .map(
      ([k, v]) =>
        `<div class="kv"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>`
    )
    .join('')
}

function show(el: HTMLElement, msg: string): void {
  el.textContent = msg
  el.hidden = !msg
}

function clearMessages(): void {
  show(notice, '')
  show(error, '')
}

// Best-effort, browser-reported identity. Labels stay honest: this is what
// the browser tells us, not a device attestation.
function parseUA(ua: string): { browser: string; os: string; deviceClass: string } {
  let m: RegExpMatchArray | null
  let browser = 'Unknown'
  if ((m = ua.match(/Edg(?:e|A|iOS)?\/([\d.]+)/))) browser = `Edge ${m[1]}`
  else if ((m = ua.match(/OPR\/([\d.]+)/))) browser = `Opera ${m[1]}`
  else if ((m = ua.match(/CriOS\/([\d.]+)/))) browser = `Chrome (iOS) ${m[1]}`
  else if ((m = ua.match(/FxiOS\/([\d.]+)/))) browser = `Firefox (iOS) ${m[1]}`
  else if ((m = ua.match(/Chrome\/([\d.]+)/))) browser = `Chrome ${m[1]}`
  else if ((m = ua.match(/Firefox\/([\d.]+)/))) browser = `Firefox ${m[1]}`
  else if ((m = ua.match(/Version\/([\d.]+)[^]*Safari/))) browser = `Safari ${m[1]}`

  let os = 'Unknown'
  if ((m = ua.match(/Android ([\d.]+)/))) os = `Android ${m[1]}`
  else if (/iPhone|iPad|iPod/.test(ua)) {
    const v = ua.match(/OS ([\d_]+)/)
    os = v ? `iOS ${v[1].replace(/_/g, '.')}` : 'iOS'
  } else if ((m = ua.match(/Windows NT ([\d.]+)/))) os = `Windows (NT ${m[1]})`
  else if ((m = ua.match(/Mac OS X ([\d_.]+)/))) os = `macOS ${m[1].replace(/_/g, '.')}`
  else if (/Linux/.test(ua)) os = 'Linux'

  let deviceClass = 'Desktop / laptop'
  if (/iPad|Tablet/.test(ua)) deviceClass = 'Tablet'
  else if (/Mobi|Android|iPhone/.test(ua)) deviceClass = 'Phone'

  return { browser, os, deviceClass }
}

function readGpu(): string | null {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return null
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const raw = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER)
    return raw ? String(raw) : null
  } catch {
    return null
  }
}

async function readBattery(): Promise<Snapshot['battery']> {
  try {
    const nav = navigator as any
    if (typeof nav.getBattery !== 'function') return null
    const b = await nav.getBattery()
    return { level_pct: Math.round(b.level * 100), charging: Boolean(b.charging) }
  } catch {
    return null
  }
}

async function readStorage(): Promise<Snapshot['storage']> {
  try {
    if (!navigator.storage || typeof navigator.storage.estimate !== 'function') return null
    const est = await navigator.storage.estimate()
    if (typeof est.usage !== 'number' || typeof est.quota !== 'number') return null
    return { usage_mb: Math.round(est.usage / 1e6), quota_mb: Math.round(est.quota / 1e6) }
  } catch {
    return null
  }
}

async function collectSnapshot(): Promise<Snapshot> {
  const nav = navigator as any
  const { browser, os, deviceClass } = parseUA(navigator.userAgent)
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection || null
  const [battery, storage] = await Promise.all([readBattery(), readStorage()])
  return {
    scanned_at: new Date().toISOString(),
    user_agent: navigator.userAgent,
    browser,
    os,
    device_class: deviceClass,
    languages: Array.from(navigator.languages || [navigator.language]),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      dpr: window.devicePixelRatio || 1,
      color_depth: window.screen.colorDepth,
    },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    memory_gb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    touch_points: typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0,
    gpu: readGpu(),
    connection: conn
      ? {
          effective_type: conn.effectiveType || null,
          downlink_mbps: typeof conn.downlink === 'number' ? conn.downlink : null,
          rtt_ms: typeof conn.rtt === 'number' ? conn.rtt : null,
          save_data: typeof conn.saveData === 'boolean' ? conn.saveData : null,
        }
      : null,
    battery,
    storage,
    cookies_enabled: navigator.cookieEnabled,
    do_not_track: nav.doNotTrack ?? null,
    edge: null,
  }
}

function na(v: string | null | undefined): string {
  return v == null || v === '' ? 'Not reported' : v
}

function renderScan(s: Snapshot, edge: any): void {
  renderRows($('scan-device'), [
    ['Browser', na(s.browser)],
    ['OS', na(s.os)],
    ['Device class', na(s.device_class)],
    ['Languages', s.languages.length ? s.languages.join(', ') : 'Not reported'],
    ['Timezone', na(s.timezone)],
  ])

  const hardware: Row[] = [
    ['Screen', `${s.screen.width} × ${s.screen.height} @ ${s.screen.dpr}x`],
    ['Color depth', `${s.screen.color_depth}-bit`],
    ['Viewport', `${s.viewport.width} × ${s.viewport.height}`],
    ['CPU cores', s.cores == null ? 'Not reported' : String(s.cores)],
    ['Memory (approx.)', s.memory_gb == null ? 'Not reported' : `~${s.memory_gb} GB`],
    ['GPU', na(s.gpu)],
    ['Touch points', String(s.touch_points)],
  ]
  if (s.battery) {
    hardware.push(['Battery', `${s.battery.level_pct}%${s.battery.charging ? ' (charging)' : ''}`])
  }
  renderRows($('scan-hardware'), hardware)

  const connection: Row[] = []
  if (s.connection) {
    connection.push(['Connection', na(s.connection.effective_type)])
    if (s.connection.downlink_mbps != null) connection.push(['Downlink', `~${s.connection.downlink_mbps} Mbps`])
    if (s.connection.rtt_ms != null) connection.push(['Round-trip time', `~${s.connection.rtt_ms} ms`])
    if (s.connection.save_data != null) connection.push(['Data-saver mode', s.connection.save_data ? 'On' : 'Off'])
  } else {
    connection.push(['Connection', 'Not reported'])
  }
  connection.push(['Cookies', s.cookies_enabled ? 'Enabled' : 'Disabled'])
  connection.push(['Do Not Track', na(s.do_not_track)])
  if (s.storage) {
    connection.push(['Site storage', `${s.storage.usage_mb} MB used of ~${s.storage.quota_mb} MB`])
  }
  renderRows($('scan-connection'), connection)

  if (edge) {
    const loc = [edge.geo?.city, edge.geo?.region, edge.geo?.country].filter(Boolean).join(', ')
    renderRows($('scan-edge'), [
      ['IP address', na(edge.ip)],
      ['ASN', edge.network?.asn != null ? `AS${edge.network.asn}` : 'Not reported'],
      ['Network org', na(edge.network?.as_organization)],
      ['Approx. location', loc || 'Not reported'],
      ['Edge location', na(edge.network?.colo)],
      ['TLS', na(edge.network?.tls_version)],
      ['Protocol', na(edge.network?.http_protocol)],
    ])
  } else {
    renderRows($('scan-edge'), [['Network identity', 'API unreachable — skipped']])
  }
}

scanBtn.addEventListener('click', async () => {
  if (scanning) return
  scanning = true
  scanBtn.disabled = true
  clearMessages()
  try {
    const [snapshot, edgeRes] = await Promise.all([collectSnapshot(), whoami()])
    const edge = edgeRes.ok && edgeRes.data ? edgeRes.data : null
    snapshot.edge = edge
    lastSnapshot = snapshot
    renderScan(snapshot, edge)
    results.hidden = false
    results.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch {
    show(error, 'Scan failed in this browser. Try again.')
  } finally {
    scanning = false
    scanBtn.disabled = false
  }
})

saveForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!lastSnapshot) return
  const accountNumber = accountInput.value.trim()
  if (!accountNumber) {
    show(error, 'Enter your 16-digit account number to save the scan.')
    return
  }
  saveBtn.disabled = true
  clearMessages()
  try {
    const storedDeviceId = localStorage.getItem(DEVICE_ID_KEY) || undefined
    const deviceName = deviceNameInput.value.trim() || undefined
    const res = await saveAudit({
      accountNumber,
      deviceId: storedDeviceId,
      auditType: 'device',
      deviceName,
      collectedAt: lastSnapshot.scanned_at,
      snapshot: lastSnapshot,
    })
    if (res.ok) {
      if (res.data?.device_id) localStorage.setItem(DEVICE_ID_KEY, res.data.device_id)
      show(
        notice,
        `Scan saved to account ${res.data?.account_number || accountNumber} as a "device" audit.`
      )
    } else if (res.status === 404) {
      show(error, 'Account not found. Check the number and try again.')
    } else if (res.status === 400) {
      show(error, 'That does not look like a valid 16-digit account number.')
    } else {
      show(error, res.data?.error || 'Could not save the scan. Please try again.')
    }
  } catch {
    show(error, 'Network error. Is the API reachable?')
  } finally {
    saveBtn.disabled = false
  }
})
