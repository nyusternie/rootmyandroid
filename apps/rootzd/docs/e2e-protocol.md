<!-- apps/rootzd/docs/e2e-protocol.md -->

# Rootz E2E session protocol — v1 (canonical)

End-to-end encrypted shell sessions between a **client** (the `/terminal`
page on rootmyandroid.com, `apps/web`) and the **daemon** (`rootzd`,
this crate), bridged opaquely by the relay (`relay.rootmyandroid.com`).
The relay never sees plaintext (relay-handoff threat model).

Status: IMPLEMENTED — daemon v26.11.9 (`src/e2e.rs`, `src/relay.rs`,
`src/session.rs`) and web client (`apps/web/src/lib/e2e.ts`). Cross-
implementation test vector: `apps/web/src/lib/fixtures/e2e-vector.json`
MIRRORED at `apps/rootzd/tests/fixtures/e2e-vector.json` — regenerate both
together with `apps/web/tools/gen-e2e-vector.mjs`; never edit one copy.

## 0. Verified relay semantics this protocol is built on

From `rootmyandroid-relay/src/tunnel.js` (DeviceTunnel Durable Object):

- **client → daemon: 1:1 passthrough, never transformed** — no client
  identity is attached to frames.
- **daemon → clients: broadcast** — every daemon frame goes to EVERY
  attached client (up to 4 clients/device).
- The relay itself emits exactly ONE control frame on the daemon socket:
  `{"type":"authed","device_id":...}` after tunnel auth succeeds.
- Caps: 64 KiB/frame, 100 frames/second/socket. Close codes: 4401/4403/
  4404/4409/4429/4000/1012.

Consequences: every frame below carries a client-chosen **`sid`** so the
daemon can demultiplex inbound sessions and clients can discard broadcast
frames that are not theirs. Any frame without `"v":1` is treated as
relay-control and ignored (except the daemon's `authed` handling).

## 1. Cryptographic suite

| Primitive | Use |
| --- | --- |
| Ed25519 | daemon long-term identity. `device_id` = lowercase hex of SHA-256(raw 32-byte pubkey) — the same derivation the API uses at pairing (handoff §1). |
| X25519 | ephemeral key exchange, one per session. Neither side rejects the all-zero shared secret (dalek default; `@stablelib/x25519` `rejectZero=false`) — all-zero arises only from a malicious peer key. |
| HKDF-SHA256 (RFC 5869) | session key derivation |
| ChaCha20-Poly1305 (RFC 8439) | frame cipher |
| SHA-256 | device_id derivation |

## 2. Frames

All frames are JSON text WebSocket messages. All base64 is the STANDARD
alphabet, padded. One exception is OUTSIDE this protocol: the tunnel-auth
challenge issued by the API is base64URL — the daemon decodes it
(accepting both alphabets) to the raw 32 bytes it signs.

### 2.1 `hello` (client → daemon, plaintext)

```json
{"v":1,"type":"hello","sid":"<b64 16 random bytes>","eph":"<b64 32-byte X25519 pubkey>"}
```

### 2.2 `welcome` (daemon → client, plaintext)

```json
{"v":1,"type":"welcome","sid":"<b64 echo>","id":"<b64 32-byte Ed25519 pubkey>","eph":"<b64 32-byte daemon X25519 pubkey>","sig":"<b64 64-byte signature>"}
```

- `sig` = Ed25519 signature over the concatenation
  `"rootz-e2e-v1" || sid_bytes || client_eph_bytes || daemon_eph_bytes`
  (13 + 16 + 32 + 32 = 93 bytes).
- Client verification, BOTH required, either failure aborts the session:
  1. SHA-256(`id` bytes) == the `device_id` the client dialed (binds the
     E2E session to the relay-addressed device);
  2. `sig` verifies under `id` over the transcript above.
- The client is anonymous at this layer: account-number auth already
  happened at relay `/connect` (owner ruling 2026-11-04).

### 2.3 `error` (daemon → client, plaintext)

```json
{"v":1,"type":"error","sid":"<b64 echo>","error":"<code>"}
```

Codes: `session_limit` (daemon session cap 8 reached), `session_exists`
(duplicate `hello` for a live sid). Sent instead of a `welcome`; the
client aborts.

### 2.4 `enc` (both directions, after handshake)

```json
{"v":1,"type":"enc","sid":"<b64>","n":"<b64 12-byte nonce>","d":"<b64 ciphertext+tag>"}
```

- Session key = `HKDF-SHA256(ikm = X25519 shared secret (32 bytes),
  salt = client_eph_bytes || daemon_eph_bytes (64 bytes),
  info = "rootz-e2e-v1", L = 32)`.
- Cipher = ChaCha20-Poly1305, empty AAD, nonce = 12 fresh random bytes
  per message.
- `d` decrypts to exactly ONE inner frame (§3), itself JSON.
- An authentication failure on `enc` aborts the session (close the
  socket / reap the session).
- Implementations MUST chunk inner `d` payloads to ≤ 32 KiB raw, so the
  wrapped `enc` frame stays under the relay's 64 KiB cap.

## 3. Inner frames (encrypted)

Client → daemon:

```json
{"type":"stdin","d":"<b64 shell stdin bytes>"}
{"type":"close"}
```

Daemon → client:

```json
{"type":"session_info","name":"<device model or null>","tier":"root|shell|app","version":"<daemon CalVer, e.g. 26.11.9>"}
{"type":"stdout","d":"<b64 shell stdout bytes>"}
{"type":"stderr","d":"<b64 shell stderr bytes>"}
{"type":"exit","code":<shell exit code, integer or null>}
```

- `session_info` is the FIRST inner frame the daemon sends per session —
  it is how clients learn device identity details; it travels INSIDE the
  E2E channel (unlike plaintext welcome metadata, which a relay could
  rewrite). `name` is read once at daemon startup from
  `getprop ro.product.model` (read-only; null when unavailable).
- `close` is authenticated (it rides the E2E channel): the daemon reaps
  the session — drops the shell's stdin (the piped `/system/bin/sh`
  EOF-exits, the same semantics the v26.11.8 TCP terminal relies on) and
  wipes session key material.
- `exit` ends the session daemon-side; the client re-handshakes (fresh
  `hello`, fresh sid) before the next command.

## 4. Session lifecycle

- One piped `/system/bin/sh` per session (same bridge as the v26.11.8
  TCP terminal).
- Daemon caps: 8 concurrent sessions; sessions idle for 600 s (no
  inbound `enc`) are reaped (same mechanics as `close`).
- Daemon outbound pacing: ≤ 90 frames/s aggregate (under the relay's
  100 f/s cap); pump threads block on a bounded queue (backpressure
  reaches the shell's pipe buffers — never buffered unboundedly).
- The tunnel socket is shared by all sessions; all crypto happens on the
  daemon's single WS pump thread (no shared cipher state across threads).

## 5. Daemon startup identity

- Ed25519 keypair generated on first run, persisted to
  `$ROOTZD_STATE_DIR/device.key` (default `/data/local/tmp/rootzd`,
  file mode 0600); the raw 32-byte seed is the whole file. The derived
  `device_id` is also written to `device_id` (text) for `cat`-able
  display, and logged at startup.
- Pairing (`POST /v1/relay/devices`) happens once per account and is
  remembered in `$ROOTZD_STATE_DIR/paired` (contains the account number);
  re-presenting the same key is idempotent server-side (handoff §1).
- A 409 (`device_already_paired` — key bound to a DIFFERENT account)
  disables the relay lane until the state dir is cleared or the key is
  revoked and re-paired. A 403 (revoked kill switch) or a 4403 tunnel
  close disables the relay lane until daemon restart.
