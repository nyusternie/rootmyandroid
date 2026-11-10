// apps/web/tools/gen-e2e-vector.mjs — regenerate the cross-implementation
// E2E test vector for the Rootz relay session protocol
// (apps/rootzd/docs/e2e-protocol.md). Writes BOTH copies:
//   apps/web/src/lib/fixtures/e2e-vector.json      (vitest asserts the client side)
//   apps/rootzd/tests/fixtures/e2e-vector.json     (cargo test asserts the daemon side)
// The two files are byte-identical mirrors — run this script, never edit
// one copy by hand.
//
// Usage: node apps/web/tools/gen-e2e-vector.mjs   (from the repo root)
//
// Seeds are fixed arbitrary constants (marked "test vector, not a secret")
// so both implementations derive identical bytes. Random-looking but
// deterministic.

import { ChaCha20Poly1305 } from '@stablelib/chacha20poly1305'
import { generateKeyPairFromSeed, sign } from '@stablelib/ed25519'
import { HKDF } from '@stablelib/hkdf'
import { SHA256, hash as sha256 } from '@stablelib/sha256'
import { generateKeyPairFromSeed as x25519FromSeed, sharedKey } from '@stablelib/x25519'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const hex = (bytes) => Buffer.from(bytes).toString('hex')
const b64 = (bytes) => Buffer.from(bytes).toString('base64')
const unhex = (s) => new Uint8Array(Buffer.from(s, 'hex'))

// Fixed inputs (test vector, not a secret).
const sid = unhex('00112233445566778899aabbccddeeff')
const clientEphSeed = unhex('aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899')
const daemonSeed = unhex('11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff')
const daemonEphSeed = unhex('ffeeddccbbaa00998877665544332211ffeeddccbbaa00998877665544332211')
const nonce = unhex('0102030405060708090a0b0c')
// A session_info inner frame exactly as the daemon's serde emits it
// (key order: type tag, then fields in declaration order).
const plaintextInnerJson = '{"type":"session_info","name":"Pixel 5","tier":"root","version":"26.11.9"}'

const PROTOCOL_INFO = new TextEncoder().encode('rootz-e2e-v1')

// Derived values (the expectations both test suites assert).
const clientEph = x25519FromSeed(clientEphSeed)
const daemonId = generateKeyPairFromSeed(daemonSeed)
const daemonEph = x25519FromSeed(daemonEphSeed)

const transcript = new Uint8Array(PROTOCOL_INFO.length + 16 + 32 + 32)
transcript.set(PROTOCOL_INFO, 0)
transcript.set(sid, PROTOCOL_INFO.length)
transcript.set(clientEph.publicKey, PROTOCOL_INFO.length + 16)
transcript.set(daemonEph.publicKey, PROTOCOL_INFO.length + 48)
const sig = sign(daemonId.secretKey, transcript)

// Daemon-side DH view (client pub * daemon secret) — X25519 symmetry makes
// it identical to the client view.
const shared = sharedKey(daemonEph.secretKey, clientEph.publicKey)
const salt = new Uint8Array(64)
salt.set(clientEph.publicKey, 0)
salt.set(daemonEph.publicKey, 32)
const sessionKey = new HKDF(SHA256, shared, salt, PROTOCOL_INFO).expand(32)

const ciphertext = new ChaCha20Poly1305(sessionKey).seal(nonce, new TextEncoder().encode(plaintextInnerJson))

const vector = {
  sid_b64: b64(sid),
  client_eph_seed_b64: b64(clientEphSeed),
  daemon_seed_b64: b64(daemonSeed),
  daemon_eph_seed_b64: b64(daemonEphSeed),
  nonce_b64: b64(nonce),
  plaintext_inner_json: plaintextInnerJson,
  expect: {
    client_eph_pub_b64: b64(clientEph.publicKey),
    daemon_pubkey_b64: b64(daemonId.publicKey),
    device_id: hex(sha256(daemonId.publicKey)),
    daemon_eph_pub_b64: b64(daemonEph.publicKey),
    welcome_sig_b64: b64(sig),
    session_key_hex: hex(sessionKey),
    ciphertext_b64: b64(ciphertext),
  },
}

const json = JSON.stringify(vector, null, 2) + '\n'
const targets = [
  'apps/web/src/lib/fixtures/e2e-vector.json',
  'apps/rootzd/tests/fixtures/e2e-vector.json',
]
for (const rel of targets) {
  const path = resolve(REPO_ROOT, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, json)
  console.log(`wrote ${rel}`)
}
