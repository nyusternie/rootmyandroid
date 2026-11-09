# Wireless Debugging Setup — process documentation + protocol spec

Rootz v0.2 self-pairing flow. This document is the authoritative reference
for (a) the user-facing setup process (source material for the future
step-by-step guides) and (b) the wire protocol the app implements.
Everything below is either measured on our test hardware (dates noted) or
cited to the authoritative AOSP/BoringSSL source (paths + repos listed at
the bottom). No guessing.

Status legend: ✅ verified on device · 📖 spec-cited · 🚧 not yet built

---

## 1. User-facing setup process (measured 2026-11-09 on Pixel 3 / blueline, Android 12)

One-time device steps:

1. **Enable Developer options**: Settings → About phone → tap
   **Build number** 7 times. (blueline: Settings → About phone →
   "Build number" `SP1A.210812.016.C2`.) ✅
2. **Enable USB debugging** (needed only while we bootstrap/dev over USB;
   the production flow does not require a computer after pairing):
   Settings → System → Developer options → **USB debugging** ON. ✅
3. **Enable Wireless debugging**: Developer options →
   **Wireless debugging** ON. The moment this toggles on, adbd starts its
   TLSServer and publishes `_adb-tls-connect._tcp` over mDNS. ✅
   (Measured: service `adb-8CHX1PEQ1-eNJClj` resolved to
   `192.168.4.33:43277` — the port is random per session.)

Pairing steps (one-time per app/device pair):

4. Developer options → Wireless debugging → **"Pair device with pairing
   code"**. The device shows a dialog with: a **6-digit pairing code**, the
   **IP address & port** of its Pairing Server. Simultaneously it publishes
   `_adb-tls-pairing._tcp` (instance name `adb-<persist.adb.wifi.guid>`). 📖
   (UI text per AOSP docs/dev/adb_wifi.md; dialog screenshot pending capture
   during our first live pairing run.)
5. In Rootz: enter the 6-digit code → the app performs the pairing
   handshake (§3) against the discovered pairing service. 🚧
6. After pairing, the app connects to the `_adb-tls-connect._tcp` service
   (§4) — no user interaction needed from then on; reconnects are
   automatic while Wireless debugging stays on. 📖/🚧

Notes for guides:

- The pairing dialog's **port changes every time** it is opened — guides
  must show discovery-based pairing, not memorized ports.
- The Pairing Server **quits after 20 failed attempts** (brute-force
  protection; `pairing_connection/internal/constants.h` kMaxPairingAttempts). 📖
- Wireless debugging does **not** survive being toggled off without
  re-pair... correction: pairing persists (key stays enrolled), only the
  TLSServer stops; toggling back on re-publishes `_adb-tls-connect._tcp`
  and previously-paired clients reconnect without re-pairing. 📖
  (adb_wifi.md "Auto-connect")

## 2. Architecture (AOSP docs/dev/adb_wifi.md) 📖

mDNS service types (all published BY the device; clients are consumers):

| Service type            | Publisher      | Meaning                          | Instance name                 |
| ----------------------- | -------------- | -------------------------------- | ----------------------------- |
| `_adb._tcp`             | adbd           | legacy `adb tcpip` (UNENCRYPTED) | `adb-<ro.serialno>-<rand>`    |
| `_adb-tls-pairing._tcp` | system_server  | Pairing Server active            | `adb-<persist.adb.wifi.guid>` |
| `_adb-tls-connect._tcp` | adbd/Framework | adbd TLS server (A_STLS) active  | `adb-<ro.serialno>-<rand>`    |

(QR pairing uses a `studio-<RANDOM-10>` instance name — out of scope for v0.2.)

Measured deviation/note (2026-11-09): on blueline the connect-service
instance was `adb-8CHX1PEQ1-eNJClj` where `8CHX1PEQ1` == the USB serial —
consistent with `adb-<serialno>-<rand>`.

## 3. Pairing protocol (client = Rootz app) 📖

Sources: `pairing_connection/pairing_connection.{h,cpp}`,
`pairing_auth/pairing_auth.{h,cpp}`, `pairing_auth/aes_128_gcm.cpp`,
`tls/tls_connection.cpp`, `proto/pairing.proto`,
BoringSSL `crypto/curve25519/spake25519.cc`.

Sequence:

1. **TCP connect** to the discovered `_adb-tls-pairing._tcp` host:port.
2. **TLS 1.3 handshake — mutual, verification OFF.** Exactly TLS 1.3
   (min=max=TLS1_3). BOTH sides present a certificate; the client accepts
   ANY server cert (`SetCertVerifyCallback` returns 1 — the channel is
   authenticated by the PAKE below, not by PKI). The client presents a
   self-signed RSA-2048 cert (template below).
3. **Derive the PAKE password**: `pswd' = pswd || EKM` where
   `pswd` = the 6-digit code as raw ASCII bytes (e.g. `"515109"`) and
   `EKM` = 64 bytes of TLS exporter: label `"adb-label"` INCLUDING the
   trailing NUL (10 bytes), no context. This binds the PAKE to the live
   TLS channel (anti-MITM).
4. **SPAKE2 exchange** (BoringSSL ed25519 flavor — NOT RFC 9382
   compatible; see quirks):
   - Roles: client = alice, identity `"adb pair client"` INCLUDING trailing
     NUL (17 bytes); server = bob, identity `"adb pair server"` + NUL
     (16 bytes).
   - Message = 32 bytes (`SPAKE2_MAX_MSG_SIZE`).
   - Envelope: `PairingPacketHeader{version=1, type=SPAKE2_MSG(0),
     payload_len=32}` — header is 6 bytes: u8 version, u8 type,
     u32 payload length in NETWORK byte order.
   - Client sends first, then reads the server's header+message.
   - SPAKE2 internals (from spake25519.cc, mirrored by our
     `SpakeTables.kt` constants):
     - private scalar: 64 random bytes → `sc_reduce` (mod l) → ×8
       (`left_shift_3`).
     - `password_hash = SHA512(pswd')`; `w = sc_reduce(password_hash)`.
     - **Cofactor quirk**: `w' = w + b0·l + b1·2l + b2·4l` where b0..b2 are
       the low 3 bits of w (l = ed25519 subgroup order). This compensates a
       historical missing ×8 on the mask scalar; both sides MUST do it.
     - Client mask point = `w'·M` (M_PRECOMP), server mask = `w'·N`
       (N_PRECOMP); message = `encode(private·B + mask)`.
     - Shared: `dh = encode(private · (peer_msg − peer_mask))`.
     - Key material: SHA512 over 8-byte-LE-length-prefixed fields, in
       alice's view: my_name, their_name, my_msg, their_msg, dh,
       password_hash (full 64 bytes). Output = 64 bytes.
5. **PeerInfo exchange** (encrypted with AES-128-GCM):
   - Key: HKDF-SHA256(key_material=64B SPAKE2 output, salt=empty,
     info=`"adb pairing_auth aes-128-gcm key"` WITHOUT trailing NUL,
     length=16).
   - Nonce: 12 bytes, all zero except bytes 0..7 = u64 LE sequence counter
     starting at 0 (separate counters per direction).
   - Tag: 16 bytes appended to ciphertext. No AAD.
   - Envelope: `PairingPacketHeader{version=1, type=PEER_INFO(1),
     payload_len=8208}` (8192 + 16-byte tag).
   - Payload plaintext = `PeerInfo` (8192 bytes packed): `u8 type` +
     `data[8191]`. Client sends type `ADB_RSA_PUB_KEY (0)` with the adb
     public key string (§5); server replies type `ADB_DEVICE_GUID (1)`
     with the device GUID string (== `persist.adb.wifi.guid`, used later
     for auto-connect/known-hosts).
   - Client sends its encrypted PeerInfo first, then reads the server's.
6. **Result**: the device's Pairing Server enrolls the presented adb public
   key into the adbd keystore (`/data/misc/adb/adb_keys`) — the app is now
   paired. (That enrollment is the device-side effect; pairing_server.cpp.)

Client certificate template (`crypto/x509_generator.cpp`
GenerateX509Certificate): X509v3, serial 1, validity now→+10 years,
subject == issuer == `C=US, O=Android, CN=Adb`, extensions:
`basicConstraints=critical,CA:TRUE`,
`keyUsage=critical,keyCertSign,cRLSign,digitalSignature`,
`subjectKeyIdentifier=hash`, signed SHA-256withRSA over the SAME RSA-2048
key as §5. (The cert is per-key; adbd authenticates the connect phase by
the enrolled key — see §4.)

## 4. Connect protocol (post-pairing, every session) 📖/🚧

1. Discover + resolve `_adb-tls-connect._tcp` (app remembers the GUID from
   pairing; adb_wifi.md "Auto-connect").
2. TCP connect → the socket opens with **A_STLS** (protocol.md:
   `STLS(type, version, "")`, command constant `0x534C5453`).
3. **TLS 1.3 handshake** with the SAME client cert/key as pairing. adbd
   sends a CertificateRequest whose CA list encodes the enrolled adb keys
   (`O=AdbKey-0, CN=<base64-adb-pubkey>` per `tls/adb_ca_list.cpp`) — the
   client picks the matching cert (we have exactly one).
4. Inside TLS: standard ADB transport messages per
   docs/dev/protocol.md (CNXN exchange → OPEN service streams →
   WRTE/OKAY/CLSE). The TLS client-cert IS the authentication — the
   legacy A_AUTH token dance does not apply to this socket type
   (adb_wifi.md: "[authentication] is different as well").
5. Service to open for the daemon bootstrap: `shell:...` (adbd runs it as
   uid 2000 `u:r:shell:s0`) — used to push/start rootzd at shell tier.
   (Daemon start mechanics proven transport-independent 2026-11-09.)

## 5. adb public key format (PeerInfo payload) 📖

`libcrypto_utils/android_pubkey.{h,cpp}` + `adb/crypto/rsa_2048_key.cpp`:

- RSA-2048, e=65537.
- Binary struct, all integers little-endian, 524 bytes total:
  1. `modulus_size_words` = 64 (u32)
  2. `n0inv` = `-1/N₀ mod 2³²` (u32) — computed as `2³² − ((N mod 2³²)⁻¹ mod 2³²)`
  3. `modulus` = N, 256 bytes little-endian (padded)
  4. `rr` = `(2²⁰⁴⁸)² mod N`, 256 bytes little-endian (Montgomery R²)
  5. `exponent` = 65537 (u32)
- The PeerInfo string = `base64(524 bytes) + " " + <comment>`; adb hosts
  use `<user>@<host>` as the comment. Rootz uses `rootz@<model>` TBD
  (cosmetic; not parsed by adbd).

## 6. Implementation notes / gotchas (each one cost real time — keep)

- **Discovery**: `NsdManager.onServiceFound` fires per address family —
  dedupe by instance name before resolving (duplicate resolve raced with
  `FAILURE_ALREADY_ACTIVE` on blueline, 2026-11-09). ✅
- **NUL bytes matter**: the SPAKE2 identity strings and the TLS exporter
  label both INCLUDE the trailing NUL; the HKDF info string does NOT.
  Off-by-one here = silent auth failure.
- **EKM access on Android**: `SSLSession`/JSSE does not expose TLS
  exporters; use Conscrypt (`org.conscrypt.Conscrypt.exportKeyingMaterial`)
  — platform provider on Android 10+; if hidden-API reflection is blocked,
  fall back to the `conscrypt-android` Maven artifact (Apache-2.0).
  DECISION PENDING first on-device test. 🚧
- **SPAKE2 has NO published KAT vectors** (BoringSSL test file:
  "TODO: add tests with fixed vectors"). Our validation ladder: RFC 8032
  vectors for the ed25519 primitives → Kotlin-alice/Kotlin-bob round-trip →
  live run against the Pixel 3 Pairing Server (the ultimate oracle). 🚧
- **Protobuf**: only the 2-value Type enum is used; payloads are raw
  bytes — NO protobuf runtime needed.
- The pairing connection is one-shot: a fresh Pairing Server instance per
  client attempt; after success or 20 failures it exits (the mDNS service
  disappears).
- TLS record layer: `ReadFully`/`WriteFully` semantics — partial reads are
  normal; loop until the exact byte count.

## 7. Checklist for the future step-by-step guide

Capture during the first live pairing run (do NOT publish before verified):

- [ ] Screenshot: Developer options → Wireless debugging toggle
- [ ] Screenshot: "Pair device with pairing code" dialog (code + IP:port)
- [ ] Screenshot: Rootz pair-code entry + success state
- [ ] Record exact device UI strings per Android version (11/12/13+ differ)
- [ ] Troubleshooting entries: mDNS blocked by AP isolation (requirement:
  same L2 network / no client isolation), pairing-dialog timeout behavior,
  "20 attempts" server lockout → close/reopen the dialog

## 8. Source citations

- AOSP `platform/packages/modules/adb` (branch main):
  docs/dev/adb_wifi.md, docs/dev/protocol.md, docs/dev/overview.md,
  proto/pairing.proto,
  pairing_connection/{pairing_connection.cpp, pairing_server.cpp,
    include/adb/pairing/pairing_connection.h, internal/constants.h},
  pairing_auth/{pairing_auth.cpp, aes_128_gcm.cpp,
    include/adb/pairing/*.h},
  tls/{tls_connection.cpp, adb_ca_list.cpp, include/adb/tls/*.h},
  client/{adb_wifi.cpp, auth.cpp}, crypto/{x509_generator.cpp,
    rsa_2048_key.cpp, key.cpp}
- AOSP `platform/system/core`: libcrypto_utils/…/android_pubkey.{h,cpp}
- BoringSSL (branch main): include/openssl/curve25519.h,
  crypto/curve25519/{spake25519.cc, spake25519_test.cc}
- Local: `SpakeTables.kt` (extracted constants), `AdbWifiDiscovery.kt`
  (slice 1), `apps/rootzd/docs/test-devices.md` (device matrix)
