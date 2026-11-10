# Wireless Debugging Setup — process documentation + protocol spec

Rootz self-pairing flow (26.11.8). This document is the authoritative reference
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
- **The pairing code EXPIRES in ~37 seconds**: the Pairing Server exits
  shortly after the dialog opens (measured 2026-11-09 on blueline: service
  published at open+0s, unpublished at open+37s, while the dialog was
  still visibly up showing a now-dead code). Enter the code PROMPTLY;
  if pairing fails with "service not found", close and re-open the dialog
  for a fresh code. The exact configured timeout is UNVERIFIED.
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

(QR pairing uses a `studio-<RANDOM-10>` instance name — out of scope for 26.11.8.)

Measured deviation/note (2026-11-09): on blueline the connect-service
instance was `adb-8CHX1PEQ1-eNJClj` where `8CHX1PEQ1` == the USB serial —
consistent with `adb-<serialno>-<rand>`.

## 3. Pairing protocol (client = Rootz app) ✅ PROVEN on blueline 2026-11-09

End-to-end success against the live Pairing Server (commit `38a1273`):
TCP connect → TLS 1.3 → EKM → SPAKE2 exchange → AES-GCM PeerInfo →
`device guid=adb-8CHX1PEQ1-eNJClj` (matches the mDNS instance name).
Full pipeline completed in ~220 ms.

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
  exporters. RESOLVED (blueline, 2026-11-09): the platform's
  `com.android.org.conscrypt.Conscrypt` is NOT class-loadable by apps
  (`Class.forName` fails for both the bundled and platform names), so
  reflection is a dead end. We BUNDLE `org.conscrypt:conscrypt-android`
  (Apache-2.0), insert its provider at priority 1 (registers as
  "Conscrypt"; the platform provider is "AndroidOpenSSL" — no name
  collision), and call its public `Conscrypt.exportKeyingMaterial`.
- **SPAKE2 has NO published KAT vectors** (BoringSSL test file:
  "TODO: add tests with fixed vectors"). VALIDATION COMPLETE: RFC 8032
  vectors for the ed25519 primitives → Kotlin-alice/Kotlin-bob round-trip
  → live run against the Pixel 3 Pairing Server PASSED 2026-11-09
  (32-byte peer message, keys agreed, PeerInfo decrypted). ✅
- **X.509 client cert is hand-rolled DER** (no bouncycastle): the
  AttributeTypeAndValue SEQUENCE inside each RDN SET is mandatory —
  OpenSSL's parser tolerated its absence, the JDK/Conscrypt parser did
  not ("X500 RDN" IOException). Regression-locked by `AdbKeyTest`
  (pure-JVM, CI-gated): v3 parse, subject/issuer CN=Adb/O=Android/C=US,
  self-signature, CA:TRUE + keyUsage, SKID (SHA-1 over the
  subjectPublicKey BIT STRING contents excluding tag/length/unused-bits
  byte, per RFC 5280 §4.2.1.2 method 1).
- **Pairing Server lifetime is SHORT** (blueline, 2026-11-09): ~10 s
  with the dialog untouched, and it dies INSTANTLY when the Settings
  activity loses the foreground (probed at 1 Hz from host + device
  loopback; mDNS advertisement briefly outlives the listener — stale
  resolves are normal). Practical consequence: launching OUR activity to
  collect the code always kills the very server we need. The user flow
  must collect the code WITHOUT foregrounding: notification inline reply
  (Shizuku pattern) or an accessibility service reading the dialog.
- **Same-device TCP from an app UID to the device's OWN external IP is
  refused** (blueline: host over Wi-Fi OK, adb-shell UID OK, app UID
  ECONNREFUSED — exact filtering mechanism unverified, no root to
  inspect). Workaround: when the resolved host equals one of our own
  interface addresses, substitute 127.0.0.1.
- **NSD sessions go stale**: a long-running NsdManager discovery stops
  delivering callbacks; a FRESH session resolves the pairing service in
  ~100 ms. The pairing receiver always creates a new discovery instance.
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

## 9. Connect phase (measured end-to-end on blueline, 2026-11-09)

Everything below was verified against a live Pixel 3 (Android 12, SQ1A.220205.002)
running Rootz commit `ff26740`. AOSP citations are on the `android12-release`
branch unless noted.

### 9.1 The `_adb-tls-connect` port is NOT TLS-from-first-byte

`transport.cpp` `BlockingConnectionAdapter::StartReadThread()` reads a plaintext
24-byte ADB packet header FIRST. Only when that packet's command is `A_STLS`
does the connection upgrade:

- `adb.cpp` `handle_packet`, case `A_STLS`: sets `t->use_tls = true` and calls
  `adbd_auth_tls_handshake(t)` (daemon side).
- Constants (`adb.h` / `adb_protocol.h`): `A_STLS = 0x534C5453`,
  `A_STLS_VERSION = 0x01000000`; the packet carries no payload.
- Sending a raw TLS ClientHello as the first bytes is misparsed as a garbage
  packet header and the connection is dropped instantly (measured: immediate
  EOF / `decode_error`).

Client sequence: open plain TCP → send `A_STLS(version=0x01000000)` → TLS-wrap
the SAME socket (`SSLSocketFactory.createSocket(plain, host, port, true)`) →
handshake → send `A_CNXN`.

### 9.2 Client certificate: present it UNCONDITIONALLY

adbd's TLS server requests a client certificate, but its CertificateRequest CA
list contains PER-KEY issuers (`CN = SHA256(DER pubkey)` —
`auth.cpp CreateCAIssuerFromEncodedKey`), which never matches the issuer of a
normal self-signed ADB cert. The default X509KeyManager therefore finds no
matching alias and sends NO certificate → handshake dies with
`PEER_DID_NOT_RETURN_A_CERTIFICATE` (measured). Fix: wrap the KeyManager and
return the ADB key alias unconditionally. Whether the key is authorized is the
SERVER's decision (`adbd_tls_verify_cert` → `IteratePublicKeys` over
`/data/misc/adb/adb_keys`, exact base64-string match).

### 9.3 adbd sends a stray `A_STLS` after the `CNXN` — ignore it, never echo it

`adb.cpp` daemon-side `A_CNXN` handler: on a TLS transport adbd answers the
client's CNXN with `send_tls_request(t)` ("This should be the first packet the
client receives to indicate the new protocol") IN ADDITION to the CNXN banner
from `adbd_wifi_secure_connect`. Measured wire order server→client:
`[CNXN(banner), A_STLS]`. Both the connect-phase and stream-phase readers must
tolerate and ignore the stray packet. Do NOT echo an A_STLS back — the daemon
would run `adbd_auth_tls_handshake` again on an established TLS connection.

### 9.4 Key enrollment: the `mKeyMap` / `writeKey` trap

Framework side (`AdbDebuggingManager.java`, frameworks/base):

- Pairing success → `onPairingResult(publicKey)` →
  `mAdbKeyStore.setLastConnectionTime(key, now)` → `writeKey(key)` appends to
  `adb_keys` — but ONLY if `!mKeyMap.containsKey(key)` (line 2261).
- `mKeyMap` is the framework's own grant store (in-memory in system_server,
  persisted to `adb_temp_keys.xml`), SEPARATE from adbd's `adb_keys` file.
- On blueline, restarting adbd WIPED `/data/misc/adb/adb_keys` but NOT
  system_server's `mKeyMap` (system_server never restarted). Subsequent
  re-pairing then SKIPPED `writeKey` (key already in `mKeyMap`) → the app key
  never re-entered `adb_keys` → every TLS connect failed with
  `PEER_DID_NOT_RETURN_A_CERTIFICATE` / `Invalid base64 key` (measured).

**Repair procedure (measured)**: Settings → Developer options →
"Revoke USB debugging authorisations" (clears BOTH stores) → re-allow the USB
host → re-run pairing. Enrollment then lands and TLS connect succeeds.

### 9.5 Additional blueline measurements

- `adb wifi` status `ssdp: 0` is normal (advertisement is mDNS-based; there is
  no separate SSDP component).
- `settings put global adb_wifi_enabled 1` does NOT stick on this build —
  SystemUI's WifiDebuggingActivity consent gate reverts it to 0 within seconds
  unless the network was previously allowed. Toggling in the UI (+ consent
  dialog) is the reliable path.
- mDNS announcement cadence: announcements ride state changes; a discovery
  session started between announcements can receive nothing until the next
  one. Fresh sessions after an announcement resolve in <1s.
- Full connect round-trip (A_STLS → TLS → CNXN → OPEN shell:id → output):
  ~90ms on LAN.
- The resulting shell runs as uid 2000 (shell) — confirmed via `id` output in
  the app UI.
