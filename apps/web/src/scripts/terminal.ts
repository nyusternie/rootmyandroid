// src/scripts/terminal.ts — /terminal page logic (framework-free).
// Connects to a Rootz device through the relay
// (wss://relay.rootmyandroid.com/connect?device=…&account=…) and runs an
// E2E-encrypted shell session (src/lib/e2e.ts; canonical spec:
// apps/rootzd/docs/e2e-protocol.md). The relay bridges frames opaquely —
// account-number auth happens at the relay; device identity is proven
// inside the E2E handshake (device-id binding + transcript signature).
//
// The device is picked from the account's paired devices
// (POST /v1/relay/devices/list — owner order 2026-11-24); a ?device=<64hex>
// link (the Rootz pairing QR) is offered as an extra option.

import { listRelayDevices } from '../lib/api.js'
import {
  clientHello,
  hex,
  openInner,
  parseFrame,
  processWelcome,
  sealInner,
  type ClientSession,
} from '../lib/e2e.js'

const RELAY_CONNECT = 'wss://relay.rootmyandroid.com/connect'
const LS_ACCOUNT = 'rma.terminal.account'
const LS_DEVICE = 'rma.terminal.device'

// API formatAccountNumber parity: digits grouped in 4s ("1234 5678 …").
// The relay entry normalizes both sides to raw digits before comparing
// (verified live 2026-11-10), so spaced or raw input connects — we keep
// the canonical spaced form for display and localStorage.
function formatAccountNumber(input: string): string {
  return input.replace(/[^0-9]/g, '').replace(/(.{4})(?=.)/g, '$1 ')
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id}`)
  return found as T
}

document.addEventListener('DOMContentLoaded', () => {
  const accountInput = el<HTMLInputElement>('account-number')
  const deviceSelect = el<HTMLSelectElement>('device-select')
  const loadDevicesBtn = el<HTMLButtonElement>('load-devices-btn')
  const connectBtn = el<HTMLButtonElement>('connect-btn')
  const disconnectBtn = el<HTMLButtonElement>('disconnect-btn')
  const statusEl = el<HTMLParagraphElement>('conn-status')
  const logEl = el<HTMLDivElement>('terminal-log')
  const clearBtn = el<HTMLButtonElement>('clear-btn')
  const commandForm = el<HTMLFormElement>('command-form')
  const commandInput = el<HTMLInputElement>('command-input')
  const sendBtn = el<HTMLButtonElement>('send-btn')
  const infoId = el<HTMLElement>('devinfo-id')
  const infoName = el<HTMLElement>('devinfo-name')
  const infoTier = el<HTMLElement>('devinfo-tier')
  const infoVersion = el<HTMLElement>('devinfo-version')

  let ws: WebSocket | null = null
  let session: ClientSession | null = null
  let pendingStdin: Uint8Array[] = []
  // Streaming UTF-8 decode: a multibyte sequence may split across chunks.
  let outDecoder = new TextDecoder()
  let errDecoder = new TextDecoder()

  const storedAccount = localStorage.getItem(LS_ACCOUNT) ?? ''
  const storedDevice = localStorage.getItem(LS_DEVICE) ?? ''
  accountInput.value = storedAccount

  // QR handoff (owner order 2026-11-24): the Rootz app's pairing QR opens
  // this page with ?device=<64-hex>. A device that is not in the account's
  // list yet (just paired, list not refreshed) is offered as an option.
  const deviceFromUrl = new URLSearchParams(location.search).get('device')
  const linkedDevice =
    deviceFromUrl && /^[0-9a-f]{64}$/i.test(deviceFromUrl.trim())
      ? deviceFromUrl.trim().toLowerCase()
      : ''

  function deviceOption(id: string, label: string): HTMLOptionElement {
    const option = document.createElement('option')
    option.value = id
    option.textContent = label
    return option
  }

  function shortId(id: string): string {
    return `${id.slice(0, 8)}…`
  }

  /** Fill the picker: the account's devices first, then the ?device= link
   *  when the list does not include it. Selection order: the linked device,
   *  the last device used on this browser, else the first row. */
  function setDeviceOptions(devices: Array<{ device_id?: string; device_name?: string }>): void {
    deviceSelect.innerHTML = ''
    const seen = new Set<string>()
    for (const device of devices) {
      const id = String(device.device_id ?? '').toLowerCase()
      if (!/^[0-9a-f]{64}$/.test(id) || seen.has(id)) continue
      seen.add(id)
      const name = device.device_name || 'Rootz device'
      deviceSelect.appendChild(deviceOption(id, `${name} — ${shortId(id)}`))
    }
    if (linkedDevice && !seen.has(linkedDevice)) {
      deviceSelect.appendChild(deviceOption(linkedDevice, `Device from your link — ${shortId(linkedDevice)}`))
      seen.add(linkedDevice)
    }
    if (!deviceSelect.options.length) {
      deviceSelect.appendChild(deviceOption('', 'No devices paired to this account yet'))
      return
    }
    const preferred = [linkedDevice, storedDevice].find((id) => id && seen.has(id))
    deviceSelect.value = preferred ?? deviceSelect.options[0].value
  }

  async function loadDevices(): Promise<void> {
    const account = accountInput.value.replace(/[^0-9]/g, '')
    if (account.length !== 16) {
      setStatus('Enter your 16-digit account number first.', 'warn')
      return
    }
    loadDevicesBtn.disabled = true
    setStatus('Loading devices…', 'muted')
    try {
      const res = await listRelayDevices(account)
      const devices = res.ok ? (res.data?.devices ?? []) : []
      if (res.ok) {
        setDeviceOptions(devices)
        setStatus(
          devices.length
            ? `Loaded ${devices.length} device${devices.length === 1 ? '' : 's'} — pick one and connect.`
            : 'No devices paired to this account yet — pair one in the Rootz app.',
          devices.length ? 'ok' : 'warn',
        )
      } else if (res.status === 404) {
        setStatus('Account not found — check the 16-digit number.', 'warn')
      } else if (res.status === 429) {
        setStatus('Too many device-list requests — wait a minute, then retry.', 'warn')
      } else {
        setStatus('Could not load devices. Retry in a moment.', 'warn')
      }
    } catch {
      setStatus('Network error. Is the API reachable?', 'warn')
    } finally {
      loadDevicesBtn.disabled = false
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

  function appendLog(text: string, cls?: string): void {
    const span = document.createElement('span')
    if (cls) span.className = cls
    span.textContent = text
    logEl.appendChild(span)
    logEl.scrollTop = logEl.scrollHeight
  }

  function appendMarker(text: string): void {
    appendLog(`\n${text}\n`, 'text-accent')
  }

  function setConnectedUi(connected: boolean): void {
    connectBtn.disabled = connected
    disconnectBtn.disabled = !connected
    commandInput.disabled = !connected
    sendBtn.disabled = !connected
  }

  function resetSession(): void {
    session = null
    pendingStdin = []
    outDecoder = new TextDecoder()
    errDecoder = new TextDecoder()
  }

  function teardown(message: string): void {
    resetSession()
    const sock = ws
    ws = null
    if (sock && sock.readyState <= WebSocket.OPEN) {
      try {
        sock.close()
      } catch {
        /* already closing */
      }
    }
    setConnectedUi(false)
    setStatus(message, 'warn')
  }

  function handshakeAndSend(bytes?: Uint8Array): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (bytes) pendingStdin.push(bytes)
    const hello = clientHello()
    session = hello.session
    ws.send(hello.frame)
  }

  loadDevicesBtn.addEventListener('click', () => {
    void loadDevices()
  })

  // Pre-fill from the stored account: one list request on page load, so a
  // returning user lands on a ready picker (limit: 20/IP/hour, 30/account).
  // Without a stored account the picker still shows a ?device= link option.
  if (storedAccount.replace(/[^0-9]/g, '').length === 16) {
    void loadDevices()
  } else {
    setDeviceOptions([])
  }

  connectBtn.addEventListener('click', () => {
    const account = formatAccountNumber(accountInput.value)
    const device = deviceSelect.value.trim().toLowerCase()
    if (account.replace(/[^0-9]/g, '').length !== 16) {
      setStatus('Enter your 16-digit account number.', 'warn')
      return
    }
    if (!/^[0-9a-f]{64}$/.test(device)) {
      setStatus('Pick a device from the list (or load your account first).', 'warn')
      return
    }
    localStorage.setItem(LS_ACCOUNT, account)
    localStorage.setItem(LS_DEVICE, device)

    setStatus('Connecting through the relay…', 'muted')
    setConnectedUi(true)
    window.rmaEvent?.('terminal_connect')

    const url = `${RELAY_CONNECT}?device=${encodeURIComponent(device)}&account=${encodeURIComponent(account)}`
    const sock = new WebSocket(url)
    ws = sock

    sock.addEventListener('open', () => {
      handshakeAndSend()
    })

    sock.addEventListener('message', (event) => {
      if (typeof event.data !== 'string' || ws !== sock) return
      const frame = parseFrame(event.data)
      switch (frame.kind) {
        case 'welcome': {
          if (!session) return
          try {
            processWelcome(session, frame, device)
          } catch (e) {
            window.rmaEvent?.('terminal_error', { error: 'handshake' })
            teardown(`Handshake failed: ${e instanceof Error ? e.message : String(e)}`)
            return
          }
          window.rmaEvent?.('terminal_e2e')
          setStatus('Connected — E2E encrypted ✓', 'ok')
          infoId.textContent = device
          const queued = pendingStdin
          pendingStdin = []
          for (const bytes of queued) ws?.send(sealInner(session, { kind: 'stdin', d: bytes }))
          return
        }
        case 'enc': {
          if (!session) return
          if (hex(frame.sid) !== hex(session.sid)) return // broadcast for another client (relay semantics)
          const inner = openInner(session, frame)
          if (!inner) {
            window.rmaEvent?.('terminal_error', { error: 'decrypt' })
            teardown('Encrypted frame failed authentication — session aborted.')
            return
          }
          switch (inner.kind) {
            case 'stdout':
              appendLog(outDecoder.decode(inner.d, { stream: true }), 'text-ok')
              return
            case 'stderr':
              appendLog(errDecoder.decode(inner.d, { stream: true }), 'text-warn')
              return
            case 'session_info':
              infoName.textContent = inner.name ?? 'unknown'
              infoTier.textContent = inner.tier
              infoVersion.textContent = `v${inner.version}`
              return
            case 'exit':
              appendMarker(`— shell exited (code ${inner.code ?? 'unknown'}) —`)
              setStatus('Connected — session ended; the next command starts a fresh session.', 'ok')
              resetSession()
              return
            default:
              return
          }
        }
        case 'error': {
          const msg =
            frame.error === 'session_limit'
              ? 'The device is busy (too many sessions) — close another terminal and retry.'
              : `Device error: ${frame.error || 'unknown'}`
          appendMarker(`— ${msg} —`)
          return
        }
        default:
          return
      }
    })

    sock.addEventListener('close', (event) => {
      if (ws !== sock) return
      resetSession()
      ws = null
      setConnectedUi(false)
      const known: Record<number, string> = {
        4401: 'Relay rejected the connection (account not paired to this device?).',
        4403: 'This device pairing was revoked.',
        4404: 'Device is offline — start rootzd on the device, then retry.',
        4409: 'Device is busy (too many clients) — retry shortly.',
        4429: 'Rate limited by the relay — retry shortly.',
        4000: 'Relay cycled the connection — click Connect to redial.',
        1012: 'Relay is restarting — click Connect to redial.',
      }
      setStatus(known[event.code] ?? `Disconnected (code ${event.code}).`, 'warn')
    })

    sock.addEventListener('error', () => {
      // The paired close event carries the details.
    })
  })

  disconnectBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN && session?.key) {
      try {
        ws.send(sealInner(session, { kind: 'close' }))
      } catch {
        /* socket already going away */
      }
    }
    teardown('Disconnected.')
  })

  commandForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const cmd = commandInput.value
    if (!cmd) return
    commandInput.value = ''
    appendMarker(`$ ${cmd}`)
    window.rmaEvent?.('terminal_command')
    const bytes = new TextEncoder().encode(`${cmd}\n`)
    if (session?.key) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(sealInner(session, { kind: 'stdin', d: bytes }))
    } else {
      // Fresh session needed (first command, or the previous shell exited).
      handshakeAndSend(bytes)
    }
  })

  clearBtn.addEventListener('click', () => {
    logEl.textContent = ''
  })

  window.addEventListener('beforeunload', () => {
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close()
  })
})
