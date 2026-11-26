// src/lib/harness-relay.ts — browser-side relay command runner for /harness.
//
// The /harness page uses this for the two-way model chat and the relay
// readiness check. It speaks the same E2E protocol as /terminal
// (apps/rootzd/docs/e2e-protocol.md v1) and the Rootz app daemon.
//
// The model command is a protocol extension (e2e-protocol.md §3.1):
// a stdin line beginning `__harness_model__` is handled by the Rootz app
// daemon BEFORE CommandGuard and calls the on-device llama-server. The
// readiness check uses a normal shell line with a done marker because the
// app daemon runs each stdin line as a one-shot and does not emit an exit
// frame for it (only the exact `exit` line does).

import {
  clientHello,
  hex,
  openInner,
  parseFrame,
  processWelcome,
  sealInner,
  type ClientSession,
} from './e2e.js'

const RELAY_CONNECT = 'wss://relay.rootmyandroid.com/connect'

export type RelayError =
  | 'handshake'
  | 'relay_error'
  | 'relay_closed'
  | 'timeout'
  | 'wireless_adb_not_ready'
  | 'device_error'

export interface RelayResult {
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
  name: string | null
  tier: string
  version: string
  error?: RelayError
}

export interface RelayOptions {
  account: string
  device: string
  command: string
  /** Resolve when this marker appears in stdout, with its numeric code. */
  doneMarker?: string
  timeoutMs?: number
  onStatus?: (status: string) => void
}

export function runRelayCommand(opts: RelayOptions): Promise<RelayResult> {
  const {
    account,
    device,
    command,
    doneMarker,
    timeoutMs = 30_000,
    onStatus,
  } = opts

  return new Promise((resolve) => {
    let ws: WebSocket | null = null
    let session: ClientSession | null = null
    let settled = false
    let stdout = ''
    let stderr = ''
    let name: string | null = null
    let tier = ''
    let version = ''
    const outDecoder = new TextDecoder()
    const errDecoder = new TextDecoder()
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (result: RelayResult): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (ws) {
        if (session && session.key) {
          try {
            ws.send(sealInner(session, { kind: 'close' }))
          } catch {
            /* already closing */
          }
        }
        try {
          ws.close()
        } catch {
          /* already closing */
        }
      }
      resolve(result)
    }

    timer = setTimeout(() => {
      finish({
        ok: false,
        stdout,
        stderr,
        code: null,
        name,
        tier,
        version,
        error: 'timeout',
      })
    }, timeoutMs)

    let socket: WebSocket
    try {
      socket = new WebSocket(
        `${RELAY_CONNECT}?device=${encodeURIComponent(device)}&account=${encodeURIComponent(account)}`,
      )
      ws = socket
    } catch {
      finish({
        ok: false,
        stdout: '',
        stderr: '',
        code: null,
        name: null,
        tier: '',
        version: '',
        error: 'relay_error',
      })
      return
    }

    onStatus?.('Connecting through the relay…')

    socket.addEventListener('open', () => {
      const hello = clientHello()
      session = hello.session
      ws?.send(hello.frame)
      onStatus?.('Handshaking with the device…')
    })

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string' || !session) return
      const frame = parseFrame(event.data)

      if (frame.kind === 'welcome') {
        try {
          processWelcome(session, frame, device)
        } catch {
          finish({
            ok: false,
            stdout,
            stderr,
            code: null,
            name,
            tier,
            version,
            error: 'handshake',
          })
          return
        }
        const bytes = new TextEncoder().encode(`${command}\n`)
        ws?.send(sealInner(session, { kind: 'stdin', d: bytes }))
        onStatus?.('Sent — waiting for the device…')
        return
      }

      if (frame.kind === 'enc') {
        if (hex(frame.sid) !== hex(session.sid)) return
        const inner = openInner(session, frame)
        if (!inner) {
          finish({
            ok: false,
            stdout,
            stderr,
            code: null,
            name,
            tier,
            version,
            error: 'device_error',
          })
          return
        }
        if (inner.kind === 'session_info') {
          name = inner.name
          tier = inner.tier
          version = inner.version
          onStatus?.(
            `Connected — ${inner.name ?? 'device'} · ${inner.tier} · v${inner.version}`,
          )
          return
        }
        if (inner.kind === 'stdout') {
          stdout += outDecoder.decode(inner.d, { stream: true })
          if (doneMarker) {
            const idx = stdout.lastIndexOf(doneMarker)
            if (idx >= 0) {
              const after = stdout.slice(idx + doneMarker.length)
              const match = /^(\d+)\r?\n/.exec(after)
              if (match) {
                stdout = stdout.slice(0, idx).replace(/\n$/, '')
                const code = Number(match[1])
                finish({
                  ok: code === 0,
                  stdout,
                  stderr,
                  code,
                  name,
                  tier,
                  version,
                })
              }
            }
          }
          return
        }
        if (inner.kind === 'stderr') {
          stderr += errDecoder.decode(inner.d, { stream: true })
          if (/wireless adb not ready/i.test(stderr)) {
            finish({
              ok: false,
              stdout,
              stderr,
              code: null,
              name,
              tier,
              version,
              error: 'wireless_adb_not_ready',
            })
          }
          return
        }
        if (inner.kind === 'exit') {
          stdout += outDecoder.decode()
          stderr += errDecoder.decode()
          const ok =
            inner.code === 0 && !/wireless adb not ready/i.test(stderr)
          finish({
            ok,
            stdout,
            stderr,
            code: inner.code,
            name,
            tier,
            version,
            error: ok ? undefined : 'device_error',
          })
        }
        return
      }

      if (frame.kind === 'error') {
        finish({
          ok: false,
          stdout,
          stderr,
          code: null,
          name,
          tier,
          version,
          error: 'device_error',
        })
      }
    })

    socket.addEventListener('error', () => {
      finish({
        ok: false,
        stdout,
        stderr,
        code: null,
        name,
        tier,
        version,
        error: 'relay_error',
      })
    })

    socket.addEventListener('close', () => {
      if (!settled) {
        finish({
          ok: false,
          stdout,
          stderr,
          code: null,
          name,
          tier,
          version,
          error: 'relay_closed',
        })
      }
    })
  })
}
