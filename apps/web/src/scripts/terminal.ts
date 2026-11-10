// src/scripts/terminal.ts — /terminal page logic (framework-free).
// Connects to a Rootz device through the relay
// (wss://relay.rootmyandroid.com/connect?device=…&account=…) and runs an
// E2E-encrypted shell session (src/lib/e2e.ts; canonical spec:
// apps/rootzd/docs/e2e-protocol.md). The relay bridges frames opaquely —
// account-number auth happens at the relay; device identity is proven
// inside the E2E handshake (device-id binding + transcript signature).
//
// No device-list endpoint exists (as of 2026-11-10 —
// apps/rootzd/docs/relay-api-todo-2026-11-10.md), so the device_id the
// daemon prints at startup is pasted manually (persisted in localStorage).

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

// API formatAccountNumber parity: digits grouped in 4s ("1234 5678 …") —
// the relay's pairing lookup matches this exact string.
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
  const deviceInput = el<HTMLInputElement>('device-id')
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

  accountInput.value = localStorage.getItem(LS_ACCOUNT) ?? ''
  deviceInput.value = localStorage.getItem(LS_DEVICE) ?? ''

  function setStatus(text: string, tone: 'ok' | 'warn' | 'muted'): void {
    statusEl.textContent = text
    statusEl.className = tone === 'ok' ? 'small text-ok' : tone === 'warn' ? 'small text-warn' : 'small muted'
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

  connectBtn.addEventListener('click', () => {
    const account = formatAccountNumber(accountInput.value)
    const device = deviceInput.value.trim().toLowerCase()
    if (account.replace(/[^0-9]/g, '').length !== 16) {
      setStatus('Enter your 16-digit account number.', 'warn')
      return
    }
    if (!/^[0-9a-f]{64}$/.test(device)) {
      setStatus('Enter the device_id rootzd printed at startup (64 hex characters).', 'warn')
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
