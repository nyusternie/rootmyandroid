// src/lib/e2e.test.ts — Rootz E2E crypto conformance:
//  1. RFC vectors for every primitive's exact call path
//     (7748 X25519, 8032 Ed25519, 5869 HKDF, 8439 ChaCha20-Poly1305)
//  2. client<->daemon handshake roundtrip + tamper rejection
//  3. the cross-implementation fixture (fixtures/e2e-vector.json — mirrored
//     at apps/rootzd/tests/fixtures/e2e-vector.json; regenerate both with
//     apps/web/tools/gen-e2e-vector.mjs). If the Rust daemon and this
//     client drift byte-wise, BOTH suites fail.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ChaCha20Poly1305 } from '@stablelib/chacha20poly1305'
import { generateKeyPairFromSeed, sign, verify } from '@stablelib/ed25519'
import { HKDF } from '@stablelib/hkdf'
import { SHA256 } from '@stablelib/sha256'
import { generateKeyPairFromSeed as x25519FromSeed, scalarMult, sharedKey } from '@stablelib/x25519'
import {
  b64d,
  b64e,
  clientHello,
  daemonHello,
  deriveKey,
  deviceIdFromPubkey,
  hex,
  openInner,
  parseFrame,
  parseInner,
  processWelcome,
  sealInner,
  transcript,
} from './e2e.js'

const unhex = (s: string): Uint8Array => new Uint8Array(s.match(/.{2}/g)!.map((b) => parseInt(b, 16)))

describe('RFC vectors (call-path conformance)', () => {
  it('RFC 7748 §5.2 — X25519 scalarMult', () => {
    const aliceSecret = unhex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a')
    const bobPublic = unhex('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f')
    const shared = unhex('4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742')
    expect(hex(scalarMult(aliceSecret, bobPublic))).toBe(hex(shared))
  })

  it('RFC 8032 §7.1 TEST 1 — Ed25519 seed->sign path', () => {
    const seed = unhex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')
    const kp = generateKeyPairFromSeed(seed)
    expect(hex(kp.publicKey)).toBe('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')
    const sig = sign(kp.secretKey, new Uint8Array(0))
    expect(hex(sig)).toBe(
      'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
    )
    expect(verify(kp.publicKey, new Uint8Array(0), sig)).toBe(true)
  })

  it('RFC 5869 §A.1 Case 1 — HKDF-SHA256 new+expand path', () => {
    const ikm = new Uint8Array(22).fill(0x0b)
    const salt = unhex('000102030405060708090a0b0c')
    const info = unhex('f0f1f2f3f4f5f6f7f8f9')
    const okm = new HKDF(SHA256, ikm, salt, info).expand(42)
    expect(hex(okm)).toBe('3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865')
  })

  it('RFC 8439 §2.8.2 — ChaCha20-Poly1305 seal path (AAD variant)', () => {
    const key = unhex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f')
    const nonce = unhex('070000004041424344454647')
    const aad = unhex('50515253c0c1c2c3c4c5c6c7')
    const pt = new TextEncoder().encode(
      "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
    )
    const ct = new ChaCha20Poly1305(key).seal(nonce, pt, aad)
    expect(hex(ct)).toBe(
      'd31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d63dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b3692ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc3ff4def08e4b7a9de576d26586cec64b6116' +
        '1ae10b594f09e26a7e902ecbd0600691',
    )
  })
})

describe('handshake roundtrip', () => {
  const daemonSeed = unhex('11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff')
  const daemonId = generateKeyPairFromSeed(daemonSeed)
  const deviceId = deviceIdFromPubkey(daemonId.publicKey)

  it('client<->daemon full session', () => {
    const hello = clientHello()
    const daemon = daemonHello(daemonSeed, parseFrame(hello.frame))
    const welcome = parseFrame(daemon.welcome)
    const clientKey = processWelcome(hello.session, welcome, deviceId)
    expect(hex(clientKey)).toBe(hex(daemon.key))

    // client -> daemon
    const encStdin = sealInner(hello.session, { kind: 'stdin', d: new TextEncoder().encode('id\n') })
    const daemonOpen = openInner({ ...hello.session, key: daemon.key }, parseFrame(encStdin))
    expect(daemonOpen).toEqual({ kind: 'stdin', d: new TextEncoder().encode('id\n') })

    // daemon -> client
    const encStdout = sealInner({ ...hello.session, key: daemon.key }, { kind: 'stdout', d: new TextEncoder().encode('uid=0\n') })
    const clientOpen = openInner(hello.session, parseFrame(encStdout))
    expect(clientOpen).toEqual({ kind: 'stdout', d: new TextEncoder().encode('uid=0\n') })
  })

  it('rejects a welcome for the wrong device', () => {
    const hello = clientHello()
    const daemon = daemonHello(daemonSeed, parseFrame(hello.frame))
    expect(() => processWelcome(hello.session, parseFrame(daemon.welcome), 'ff'.repeat(32))).toThrow(/device id mismatch/)
  })

  it('rejects a tampered transcript signature', () => {
    const hello = clientHello()
    const daemon = daemonHello(daemonSeed, parseFrame(hello.frame))
    const welcome = parseFrame(daemon.welcome)
    if (welcome.kind !== 'welcome') throw new Error('unreachable')
    welcome.sig[0] ^= 1
    expect(() => processWelcome(hello.session, welcome, deviceId)).toThrow(/transcript signature/)
  })

  it('rejects a tampered ciphertext', () => {
    const hello = clientHello()
    const daemon = daemonHello(daemonSeed, parseFrame(hello.frame))
    processWelcome(hello.session, parseFrame(daemon.welcome), deviceId)
    const enc = sealInner(hello.session, { kind: 'stdin', d: new TextEncoder().encode('id\n') })
    const frame = parseFrame(enc)
    if (frame.kind !== 'enc') throw new Error('unreachable')
    frame.d[0] ^= 1
    expect(openInner(hello.session, frame)).toBeNull()
  })

  it('ignores enc frames for another sid (relay broadcast semantics)', () => {
    const hello = clientHello()
    const daemon = daemonHello(daemonSeed, parseFrame(hello.frame))
    processWelcome(hello.session, parseFrame(daemon.welcome), deviceId)
    const other = clientHello()
    processWelcome(other.session, parseFrame(daemonHello(daemonSeed, parseFrame(other.frame)).welcome), deviceId)
    const encForOther = sealInner(other.session, { kind: 'stdout', d: new TextEncoder().encode('secret\n') })
    expect(openInner(hello.session, parseFrame(encForOther))).toBeNull()
  })
})

describe('cross-implementation fixture', () => {
  interface Vector {
    sid_b64: string
    client_eph_seed_b64: string
    daemon_seed_b64: string
    daemon_eph_seed_b64: string
    nonce_b64: string
    plaintext_inner_json: string
    expect: {
      client_eph_pub_b64: string
      daemon_pubkey_b64: string
      device_id: string
      daemon_eph_pub_b64: string
      welcome_sig_b64: string
      session_key_hex: string
      ciphertext_b64: string
    }
  }
  const v: Vector = JSON.parse(readFileSync(fileURLToPath(new URL('fixtures/e2e-vector.json', import.meta.url)), 'utf8'))
  const sid = b64d(v.sid_b64)!
  const clientSeed = b64d(v.client_eph_seed_b64)!
  const daemonSeed = b64d(v.daemon_seed_b64)!
  const daemonEphSeed = b64d(v.daemon_eph_seed_b64)!
  const nonce = b64d(v.nonce_b64)!

  it('client-side derivations match the recorded bytes', () => {
    // Client X25519 ephemeral pubkey from seed.
    const clientEph = x25519FromSeed(clientSeed)
    expect(b64e(clientEph.publicKey)).toBe(v.expect.client_eph_pub_b64)

    // Device identity + id derivation.
    const daemonId = generateKeyPairFromSeed(daemonSeed)
    expect(b64e(daemonId.publicKey)).toBe(v.expect.daemon_pubkey_b64)
    expect(deviceIdFromPubkey(daemonId.publicKey)).toBe(v.expect.device_id)

    // The recorded transcript signature verifies (deterministic Ed25519 —
    // the Rust test asserts byte equality with its own signing).
    const daemonEph = x25519FromSeed(daemonEphSeed)
    expect(b64e(daemonEph.publicKey)).toBe(v.expect.daemon_eph_pub_b64)
    const sig = b64d(v.expect.welcome_sig_b64)!
    expect(verify(daemonId.publicKey, transcript(sid, clientEph.publicKey, daemonEph.publicKey), sig)).toBe(true)

    // Client-side DH view -> same session key as the daemon computed.
    const key = deriveKey(sharedKey(clientEph.secretKey, daemonEph.publicKey), clientEph.publicKey, daemonEph.publicKey)
    expect(hex(key)).toBe(v.expect.session_key_hex)

    // Frame cipher: recorded ciphertext decrypts; re-sealing reproduces it.
    const cipher = new ChaCha20Poly1305(key)
    const ct = b64d(v.expect.ciphertext_b64)!
    const pt = cipher.open(nonce, ct)
    expect(pt).not.toBeNull()
    expect(new TextDecoder().decode(pt!)).toBe(v.plaintext_inner_json)
    expect(b64e(cipher.seal(nonce, new TextEncoder().encode(v.plaintext_inner_json)))).toBe(v.expect.ciphertext_b64)

    // The decrypted bytes are a parseable inner frame.
    expect(parseInner(pt!)).toEqual({ kind: 'session_info', name: 'Pixel 5', tier: 'root', version: '26.11.9' })
  })
})
