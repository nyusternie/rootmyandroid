#!/usr/bin/env node
// apps/rootzd/tools/e2e-probe.mjs — live E2E probe for the rootzd relay
// tunnel (docs/e2e-protocol.md v1). A minimal, scriptable CLIENT role:
// the same handshake + crypto as apps/web/src/lib/e2e.ts, re-implemented
// here as plain JS so it runs under bare Node (>=22, global WebSocket).
//
// DRIFT GUARD: before touching the network the probe re-derives every
// value in tests/fixtures/e2e-vector.json (the fixture mirrored with
// apps/web) and aborts on ANY mismatch — a probe that disagrees with the
// pinned client/daemon implementations proves nothing.
//
// Usage:
//   node apps/rootzd/tools/e2e-probe.mjs --selftest-only
//   node apps/rootzd/tools/e2e-probe.mjs --device <64-hex> --account "1234 5678 9012 3456" [--cmd "id; exit"]

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { ChaCha20Poly1305 } from '@stablelib/chacha20poly1305'
import { generateKeyPairFromSeed, verify } from '@stablelib/ed25519'
import { HKDF } from '@stablelib/hkdf'
import { randomBytes } from '@stablelib/random'
import { hash as sha256, SHA256 } from '@stablelib/sha256'
import { generateKeyPairFromSeed as x25519FromSeed, sharedKey } from '@stablelib/x25519'

const PROTOCOL_INFO = new TextEncoder().encode('rootz-e2e-v1')
const RELAY_CONNECT = 'wss://relay.rootmyandroid.com/connect'
const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(HERE, '..', 'tests', 'fixtures', 'e2e-vector.json')

// --- base64 / hex helpers (standard alphabet, padded — spec §2) -------------

const b64e = (bytes) => Buffer.from(bytes).toString('base64')
const b64d = (value) => new Uint8Array(Buffer.from(value, 'base64'))
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

// --- crypto core (mirrors e2e.ts exactly) -------------------------------------

const deviceIdFromPubkey = (pubkey) => hex(sha256(pubkey))

function transcript(sid, clientEph, daemonEph) {
  const t = new Uint8Array(PROTOCOL_INFO.length + sid.length + clientEph.length + daemonEph.length)
  t.set(PROTOCOL_INFO, 0)
  t.set(sid, PROTOCOL_INFO.length)
  t.set(clientEph, PROTOCOL_INFO.length + sid.length)
  t.set(daemonEph, PROTOCOL_INFO.length + sid.length + clientEph.length)
  return t
}

function deriveKey(shared, clientEph, daemonEph) {
  const salt = new Uint8Array(clientEph.length + daemonEph.length)
  salt.set(clientEph, 0)
  salt.set(daemonEph, clientEph.length)
  return new HKDF(SHA256, shared, salt, PROTOCOL_INFO).expand(32)
}

// --- drift guard: re-derive the pinned cross-implementation vector ------------

function selftest() {
  const v = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  const sid = b64d(v.sid_b64)
  const clientSeed = b64d(v.client_eph_seed_b64)
  const daemonSeed = b64d(v.daemon_seed_b64)
  const daemonEphSeed = b64d(v.daemon_eph_seed_b64)
  const nonce = b64d(v.nonce_b64)

  const eq = (name, got, want) => {
    if (got !== want) throw new Error(`SELFTEST FAIL ${name}: got ${got} want ${want}`)
    console.log(`selftest: ${name} ok`)
  }

  const clientEph = x25519FromSeed(clientSeed)
  eq('client_eph_pub', b64e(clientEph.publicKey), v.expect.client_eph_pub_b64)

  const idKp = generateKeyPairFromSeed(daemonSeed)
  eq('daemon_pubkey', b64e(idKp.publicKey), v.expect.daemon_pubkey_b64)
  eq('device_id', deviceIdFromPubkey(idKp.publicKey), v.expect.device_id)

  const daemonEph = x25519FromSeed(daemonEphSeed)
  eq('daemon_eph_pub', b64e(daemonEph.publicKey), v.expect.daemon_eph_pub_b64)

  const t = transcript(sid, clientEph.publicKey, daemonEph.publicKey)
  if (!verify(idKp.publicKey, t, b64d(v.expect.welcome_sig_b64))) {
    throw new Error('SELFTEST FAIL welcome_sig: signature does not verify')
  }
  console.log(`selftest: welcome_sig ok (transcript ${t.length} bytes)`)

  const shared = sharedKey(clientSeed, daemonEph.publicKey)
  const key = deriveKey(shared, clientEph.publicKey, daemonEph.publicKey)
  eq('session_key', hex(key), v.expect.session_key_hex)

  const cipher = new ChaCha20Poly1305(key)
  const ct = cipher.seal(nonce, new TextEncoder().encode(v.plaintext_inner_json))
  eq('ciphertext', b64e(ct), v.expect.ciphertext_b64)

  const pt = new ChaCha20Poly1305(key).open(nonce, ct)
  eq('roundtrip', new TextDecoder().decode(pt), v.plaintext_inner_json)
  console.log('selftest: all vectors match — probe crypto is in parity with the pinned implementations')
}

// --- live probe -----------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { cmd: 'id; uname -a; getprop ro.build.version.release; exit' }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--selftest-only') out.selftestOnly = true
    else if (args[i] === '--device') out.device = args[++i]
    else if (args[i] === '--account') out.account = args[++i]
    else if (args[i] === '--cmd') out.cmd = args[++i]
  }
  return out
}

function live({ device, account, cmd }) {
  const url = `${RELAY_CONNECT}?device=${encodeURIComponent(device)}&account=${encodeURIComponent(account)}`
  console.log(`probe: connecting ${RELAY_CONNECT} (device ${device.slice(0, 12)}…)`)
  const ws = new WebSocket(url)
  let opened = false
  let done = false
  let session = null // { sid, ephSecret, key }
  const dec = new TextDecoder()

  const fail = (msg) => {
    done = true
    console.error(`probe: FAIL — ${msg}`)
    try { ws.close() } catch { /* already closing */ }
    process.exit(1)
  }

  const timer = setTimeout(() => {
    if (!session?.key) fail(opened ? 'handshake timeout (open, but no welcome in 15s)' : 'connect timeout')
  }, 15_000)
  // Hard ceiling for ANY later stall (session established but no exit frame).
  const hardTimer = setTimeout(() => fail('session stalled after 30s — no exit frame'), 30_000)

  ws.addEventListener('open', () => {
    opened = true
    const kp = x25519FromSeed(randomBytes(32))
    session = { sid: randomBytes(16), ephSecret: kp.secretKey, key: null }
    const hello = JSON.stringify({ v: 1, type: 'hello', sid: b64e(session.sid), eph: b64e(kp.publicKey) })
    ws.send(hello)
    console.log('probe: hello sent')
  })

  ws.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return
    let p
    try { p = JSON.parse(event.data) } catch { return }
    if (p.v !== 1 || typeof p.type !== 'string') return

    if (p.type === 'welcome') {
      try {
        const frame = { sid: b64d(p.sid), id: b64d(p.id), eph: b64d(p.eph), sig: b64d(p.sig) }
        if (hex(frame.sid) !== hex(session.sid)) throw new Error('sid mismatch')
        if (deviceIdFromPubkey(frame.id) !== device.toLowerCase()) throw new Error('device id mismatch')
        const clientEph = x25519FromSeed(session.ephSecret).publicKey
        if (!verify(frame.id, transcript(session.sid, clientEph, frame.eph), frame.sig)) {
          throw new Error('bad transcript signature')
        }
        session.key = deriveKey(sharedKey(session.ephSecret, frame.eph), clientEph, frame.eph)
      } catch (e) {
        clearTimeout(timer)
        return fail(`welcome rejected: ${e.message}`)
      }
      clearTimeout(timer)
      console.log('probe: welcome verified — E2E session key established ✓')
      const stdin = new TextEncoder().encode(`${cmd}\n`)
      const nonce = randomBytes(12)
      // seal() takes BYTES — passing a string silently encrypts garbage
      // (untyped JS; e2e.ts's encodeInner returns TextEncoder output).
      const innerJson = new TextEncoder().encode(JSON.stringify({ type: 'stdin', d: b64e(stdin) }))
      const enc = JSON.stringify({
        v: 1, type: 'enc', sid: b64e(session.sid), n: b64e(nonce),
        d: b64e(new ChaCha20Poly1305(session.key).seal(nonce, innerJson)),
      })
      ws.send(enc)
      console.log(`probe: stdin sent ($ ${cmd})`)
      return
    }

    if (p.type === 'enc') {
      if (!session?.key) return
      if (hex(b64d(p.sid)) !== hex(session.sid)) return // broadcast for another client
      const pt = new ChaCha20Poly1305(session.key).open(b64d(p.n), b64d(p.d))
      if (!pt) return fail('enc frame failed authentication — session aborted')
      let inner
      try { inner = JSON.parse(new TextDecoder().decode(pt)) } catch { return }
      if (inner.type === 'session_info') {
        console.log(`probe: session_info — name=${inner.name} tier=${inner.tier} version=v${inner.version}`)
      } else if (inner.type === 'stdout') {
        process.stdout.write(dec.decode(b64d(inner.d), { stream: true }))
      } else if (inner.type === 'stderr') {
        process.stderr.write(dec.decode(b64d(inner.d), { stream: true }))
      } else if (inner.type === 'exit') {
        console.log(`probe: exit (code ${inner.code ?? 'unknown'})`)
        const nonce = randomBytes(12)
        const closeJson = new TextEncoder().encode(JSON.stringify({ type: 'close' }))
        ws.send(JSON.stringify({
          v: 1, type: 'enc', sid: b64e(session.sid), n: b64e(nonce),
          d: b64e(new ChaCha20Poly1305(session.key).seal(nonce, closeJson)),
        }))
        ws.close()
        clearTimeout(hardTimer)
        done = true
        console.log('probe: close sent, socket closed — FULL E2E ROUND-TRIP OK')
        process.exit(0)
      }
      return
    }

    if (p.type === 'error') return fail(`device error: ${p.error || 'unknown'}`)
  })

  ws.addEventListener('close', (event) => {
    clearTimeout(timer)
    clearTimeout(hardTimer)
    if (done) return // already reported by the path that finished us
    if (!opened) {
      console.error(`probe: FAIL — relay refused the upgrade (code ${event.code}) — device seen as offline?`)
    } else if (!session?.key) {
      console.error(`probe: FAIL — socket closed mid-handshake (code ${event.code})`)
    } else {
      console.error(`probe: FAIL — socket closed mid-session (code ${event.code})`)
    }
    process.exit(1)
  })

  ws.addEventListener('error', () => { /* close carries the detail */ })
}

const args = parseArgs()
selftest()
if (args.selftestOnly) {
  console.log('probe: --selftest-only, skipping network')
} else if (!args.device || !args.account) {
  console.error('probe: --device and --account are required for the live run')
  process.exitCode = 1
} else {
  live(args)
}
