// src/lib/e2e.ts — Rootz E2E session cryptography, client role
// (apps/rootzd/docs/e2e-protocol.md v1 — the canonical spec; the daemon
// implementation is apps/rootzd/src/e2e.rs). Pure functions + explicit
// state objects, no DOM/WebSocket access — the page module is
// src/scripts/terminal.ts. Parity with the daemon is pinned by
// fixtures/e2e-vector.json (same bytes, both test suites).

import { ChaCha20Poly1305 } from '@stablelib/chacha20poly1305'
import { generateKeyPairFromSeed, sign, verify } from '@stablelib/ed25519'
import { HKDF } from '@stablelib/hkdf'
import { randomBytes } from '@stablelib/random'
import { hash as sha256, SHA256 } from '@stablelib/sha256'
import { generateKeyPairFromSeed as x25519FromSeed, sharedKey } from '@stablelib/x25519'

export const PROTOCOL_INFO = new TextEncoder().encode('rootz-e2e-v1')

// --- base64 helpers (standard alphabet, padded — spec §2) -------------------

export function b64e(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function b64d(value: string): Uint8Array | null {
  try {
    const bin = atob(value)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// --- wire frames (spec §2/§3; field names are the contract — do not rename) --

export type Frame =
  | { kind: 'hello'; sid: Uint8Array; eph: Uint8Array }
  | { kind: 'welcome'; sid: Uint8Array; id: Uint8Array; eph: Uint8Array; sig: Uint8Array }
  | { kind: 'enc'; sid: Uint8Array; n: Uint8Array; d: Uint8Array }
  | { kind: 'error'; sid: Uint8Array | null; error: string }
  | { kind: 'other' }

export type Inner =
  | { kind: 'stdin'; d: Uint8Array }
  | { kind: 'stdout'; d: Uint8Array }
  | { kind: 'stderr'; d: Uint8Array }
  | { kind: 'exit'; code: number | null }
  | { kind: 'close' }
  | { kind: 'session_info'; name: string | null; tier: string; version: string }

export function encodeFrame(frame: Frame): string {
  switch (frame.kind) {
    case 'hello':
      return JSON.stringify({ v: 1, type: 'hello', sid: b64e(frame.sid), eph: b64e(frame.eph) })
    case 'welcome':
      return JSON.stringify({
        v: 1,
        type: 'welcome',
        sid: b64e(frame.sid),
        id: b64e(frame.id),
        eph: b64e(frame.eph),
        sig: b64e(frame.sig),
      })
    case 'enc':
      return JSON.stringify({ v: 1, type: 'enc', sid: b64e(frame.sid), n: b64e(frame.n), d: b64e(frame.d) })
    case 'error':
      return JSON.stringify({ v: 1, type: 'error', sid: frame.sid ? b64e(frame.sid) : undefined, error: frame.error })
    case 'other':
      return ''
  }
}

export function parseFrame(text: string): Frame {
  let p: Record<string, unknown>
  try {
    p = JSON.parse(text)
  } catch {
    return { kind: 'other' }
  }
  if (p.type === 'authed') return { kind: 'other' } // daemon-side relay control
  if (p.v !== 1 || typeof p.type !== 'string') return { kind: 'other' }
  const sid = typeof p.sid === 'string' ? b64d(p.sid) : null
  switch (p.type) {
    case 'hello': {
      const eph = typeof p.eph === 'string' ? b64d(p.eph) : null
      return sid && sid.length === 16 && eph && eph.length === 32 ? { kind: 'hello', sid, eph } : { kind: 'other' }
    }
    case 'welcome': {
      const id = typeof p.id === 'string' ? b64d(p.id) : null
      const eph = typeof p.eph === 'string' ? b64d(p.eph) : null
      const sig = typeof p.sig === 'string' ? b64d(p.sig) : null
      return sid && sid.length === 16 && id && id.length === 32 && eph && eph.length === 32 && sig && sig.length === 64
        ? { kind: 'welcome', sid, id, eph, sig }
        : { kind: 'other' }
    }
    case 'enc': {
      const n = typeof p.n === 'string' ? b64d(p.n) : null
      const d = typeof p.d === 'string' ? b64d(p.d) : null
      return sid && sid.length === 16 && n && n.length === 12 && d ? { kind: 'enc', sid, n, d } : { kind: 'other' }
    }
    case 'error':
      return { kind: 'error', sid: sid && sid.length === 16 ? sid : null, error: typeof p.error === 'string' ? p.error : '' }
    default:
      return { kind: 'other' }
  }
}

export function encodeInner(inner: Inner): Uint8Array {
  switch (inner.kind) {
    case 'stdin':
      return new TextEncoder().encode(JSON.stringify({ type: 'stdin', d: b64e(inner.d) }))
    case 'stdout':
      return new TextEncoder().encode(JSON.stringify({ type: 'stdout', d: b64e(inner.d) }))
    case 'stderr':
      return new TextEncoder().encode(JSON.stringify({ type: 'stderr', d: b64e(inner.d) }))
    case 'exit':
      return new TextEncoder().encode(JSON.stringify({ type: 'exit', code: inner.code }))
    case 'close':
      return new TextEncoder().encode(JSON.stringify({ type: 'close' }))
    case 'session_info':
      return new TextEncoder().encode(
        JSON.stringify({ type: 'session_info', name: inner.name, tier: inner.tier, version: inner.version }),
      )
  }
}

export function parseInner(plaintext: Uint8Array): Inner | null {
  let p: Record<string, unknown>
  try {
    p = JSON.parse(new TextDecoder().decode(plaintext))
  } catch {
    return null
  }
  if (typeof p.type !== 'string') return null
  const d = typeof p.d === 'string' ? b64d(p.d) : null
  switch (p.type) {
    case 'stdin':
      return d ? { kind: 'stdin', d } : null
    case 'stdout':
      return d ? { kind: 'stdout', d } : null
    case 'stderr':
      return d ? { kind: 'stderr', d } : null
    case 'exit':
      return { kind: 'exit', code: typeof p.code === 'number' ? p.code : null }
    case 'close':
      return { kind: 'close' }
    case 'session_info':
      return {
        kind: 'session_info',
        name: typeof p.name === 'string' ? p.name : null,
        tier: typeof p.tier === 'string' ? p.tier : '',
        version: typeof p.version === 'string' ? p.version : '',
      }
    default:
      return null
  }
}

// --- crypto core (spec §1/§2.2/§2.4) ------------------------------------------

export function deviceIdFromPubkey(pubkey: Uint8Array): string {
  return hex(sha256(pubkey))
}

/** The signed transcript: PROTOCOL_INFO || sid || client_eph || daemon_eph. */
export function transcript(sid: Uint8Array, clientEph: Uint8Array, daemonEph: Uint8Array): Uint8Array {
  const t = new Uint8Array(PROTOCOL_INFO.length + sid.length + clientEph.length + daemonEph.length)
  t.set(PROTOCOL_INFO, 0)
  t.set(sid, PROTOCOL_INFO.length)
  t.set(clientEph, PROTOCOL_INFO.length + sid.length)
  t.set(daemonEph, PROTOCOL_INFO.length + sid.length + clientEph.length)
  return t
}

export function deriveKey(shared: Uint8Array, clientEph: Uint8Array, daemonEph: Uint8Array): Uint8Array {
  const salt = new Uint8Array(clientEph.length + daemonEph.length)
  salt.set(clientEph, 0)
  salt.set(daemonEph, clientEph.length)
  return new HKDF(SHA256, shared, salt, PROTOCOL_INFO).expand(32)
}

// --- client session state ------------------------------------------------------

export interface ClientSession {
  /** 16 random bytes — the client-chosen session id (spec §0). */
  sid: Uint8Array
  /** X25519 ephemeral secret — held until the handshake completes. */
  ephSecret: Uint8Array
  /** Session key — set once `processWelcome` verifies the daemon. */
  key: Uint8Array | null
}

export function clientHello(): { session: ClientSession; frame: string } {
  const kp = x25519FromSeed(randomBytes(32))
  const session: ClientSession = { sid: randomBytes(16), ephSecret: kp.secretKey, key: null }
  return { session, frame: encodeFrame({ kind: 'hello', sid: session.sid, eph: kp.publicKey }) }
}

/**
 * Verify the daemon's welcome (spec §2.2): device-id binding + transcript
 * signature, then derive the session key. Throws on ANY mismatch.
 */
export function processWelcome(session: ClientSession, frame: Frame, expectedDeviceId: string): Uint8Array {
  if (frame.kind !== 'welcome') throw new Error('expected welcome frame')
  if (hex(frame.sid) !== hex(session.sid)) throw new Error('sid mismatch')
  if (deviceIdFromPubkey(frame.id) !== expectedDeviceId.toLowerCase()) {
    throw new Error('device id mismatch — this is not the device you dialed')
  }
  const clientEph = x25519FromSeed(session.ephSecret).publicKey
  if (!verify(frame.id, transcript(session.sid, clientEph, frame.eph), frame.sig)) {
    throw new Error('bad transcript signature')
  }
  const shared = sharedKey(session.ephSecret, frame.eph)
  session.key = deriveKey(shared, clientEph, frame.eph)
  return session.key
}

export function sealInner(session: ClientSession, inner: Inner): string {
  if (!session.key) throw new Error('handshake not complete')
  const cipher = new ChaCha20Poly1305(session.key)
  const nonce = randomBytes(12)
  return encodeFrame({ kind: 'enc', sid: session.sid, n: nonce, d: cipher.seal(nonce, encodeInner(inner)) })
}

/** null on authentication failure (spec §2.4: abort the session). */
export function openInner(session: ClientSession, frame: Frame): Inner | null {
  if (!session.key || frame.kind !== 'enc') return null
  if (hex(frame.sid) !== hex(session.sid)) return null // broadcast for another client — skip
  const plaintext = new ChaCha20Poly1305(session.key).open(frame.n, frame.d)
  return plaintext ? parseInner(plaintext) : null
}

// --- daemon role (tests only; keeps the roundtrip in-repo) ---------------------

export function daemonHello(
  daemonSeed: Uint8Array,
  frame: Frame,
): { key: Uint8Array; welcome: string; daemonEphPub: Uint8Array } {
  if (frame.kind !== 'hello') throw new Error('expected hello frame')
  const idKp = generateKeyPairFromSeed(daemonSeed)
  const ephKp = x25519FromSeed(randomBytes(32))
  const sig = sign(idKp.secretKey, transcript(frame.sid, frame.eph, ephKp.publicKey))
  const shared = sharedKey(ephKp.secretKey, frame.eph)
  return {
    key: deriveKey(shared, frame.eph, ephKp.publicKey),
    welcome: encodeFrame({ kind: 'welcome', sid: frame.sid, id: idKp.publicKey, eph: ephKp.publicKey, sig }),
    daemonEphPub: ephKp.publicKey,
  }
}
