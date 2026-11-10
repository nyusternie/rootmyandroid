<!-- apps/rootzd/docs/relay-handoff.md -->

# Handoff: Rootz relay — for `rootmyandroid-api`

Context: `apps/rootzd` (Rust daemon) runs on paired Android devices behind
carrier NAT, so it dials OUTBOUND. The relay is a **dumb pipe** bridging the
daemon and authorized clients. All payloads are E2E-encrypted between client
and daemon — the relay never sees plaintext and MUST NOT need to.

Status (2026-11-04): pairing + challenge issuance are IMPLEMENTED in
`rootmyandroid-api` (`POST /v1/relay/devices`, `POST /v1/relay/challenge`);
the WebSocket tunnel is IMPLEMENTED in the dedicated `client-relay` worker
(`relay.rootmyandroid.com`, repo: rootmyandroid-relay — a separate worker per
owner ruling so relay expenses/usage are tracked separately). Sections §1–§3
are the contract; edits below match the implementation. Follow-ups: the
revoke ENDPOINT (the `revoked_at` kill switch is already honored everywhere),
a device-list endpoint (relay-api-todo-2026-11-10.md), metering (relay is
FREE for now), metrics integration (§5).

## 1. Device registration (pairing)

- Device generates an Ed25519 keypair on first run; private key never leaves
  the device.
- `POST /v1/relay/devices` — body (as implemented): `{ account_number,
  device_pubkey, device_name? }`. `device_id` is SERVER-DERIVED as the
  SHA-256 hex of the raw pubkey bytes — no client-chosen ids, so a key can
  never silently move accounts (same key + different account → 409). The
  draft's `tier` field was dropped: plans are account-level and the relay
  itself is FREE (see the entitlement bullet below).
- Rate-limit this endpoint hard: the 16-digit account number is the ONLY
  secret at pair time (brute-force surface). Implemented: 20 attempts/hour
  per IP (salted hash, counted BEFORE account validation so guessing burns
  budget) + 10 attempts/hour per account, fixed 1-hour windows. Challenge
  issuance: 12/hour per device, 60/hour per account.
- Entitlement gate: OVERRIDDEN by owner ruling 2026-11-04 — the relay is
  FREE; abuse control is the rate caps above, NOT Halo metering. (The
  daemon's features `terminal_editor`, `log_analysis` remain Rootz Pro /
  `api_gated: true` on the API side — that gating is separate from relay
  transport. Pricing canon: HANDOFF.md §10.2.)

## 2. Daemon tunnel (primary transport)

- `GET wss://relay.rootmyandroid.com/tunnel?device=<device_id>` (WebSocket,
  upgrade) — daemon side, persistent. Auth: FIRST message must be
  `{type:'auth', device_id, challenge, signature}` — the challenge comes
  from `POST https://rootmyandroid.com/v1/relay/challenge` (single-use,
  300 s TTL); `signature` is Ed25519 over the RAW challenge bytes (no
  bearer tokens on the daemon). Success: relay-generated
  `{"type":"authed"}` control frame; failures close with the codes below.
- Relay behavior: verify signature BEFORE consuming the challenge (a bad
  signature must not burn a legitimate challenge) → consume (single-use) →
  mark device online → bridge frames to/from client connections (§3). A
  fresh daemon connection SUPERSEDES the previous one (close `4000`) —
  flapping tolerance.
- Frames are opaque. Cap frame size + per-connection rate; apply
  backpressure (drop/close, never buffer unboundedly).
- Reconnects: daemon retries with backoff; relay tolerates flapping.

## 3. Client connections

- `GET wss://relay.rootmyandroid.com/connect?device=<device_id>&account=<number>`
  (WebSocket) — client side. Auth: the raw account number bound to the
  device (owner ruling 2026-11-04 — there is no session mechanism to reuse;
  the account model is account-number-only, no email). Unknown device and
  cross-account device return the SAME 404 (existence must not leak).
- Relay bridges client ↔ daemon frames 1:1, still opaque. Close codes (as
  implemented): `4401` auth failures (bad signature, replayed/expired
  challenge, device mismatch), `4403` device revoked, `4404` device offline,
  `4409` frame too large (64 KiB cap), `4429` rate limited (100
  frames/second/socket), `4000` superseded, `1012` daemon disconnected.

## 4. Kill switch (remote revoke)

- `DELETE /v1/relay/devices/<device_id>` (or a `revoked` flag on the
  binding) — account-level revoke. ENDPOINT NOT YET IMPLEMENTED (follow-up);
  the backing `relay_devices.revoked_at` column EXISTS and is already
  honored: a revoked device gets 403/4403 on pair, challenge, tunnel, AND
  connect.
- Effect once the endpoint lands: relay refuses re-pair of that pubkey
  while revoked (implemented; an explicit un-revoke/re-pair flow ships with
  the endpoint).

## 5. Observability

- Metrics: online devices, tunnel uptime, bytes/frames relayed, pairing
  failures (rate-limit hits).
- Integrate the existing first-party analytics where sensible; keep the
  wire contract changes coordinated per repo rules.

## Non-goals for the relay

- No plaintext inspection, no command semantics, no storage of payloads.
- No LAN mode (that path is direct client↔daemon on the local network).

## Open questions for the API team

1. RESOLVED — pairing/challenges: `rootmyandroid.com/v1/relay/*`; tunnel:
   `relay.rootmyandroid.com` (dedicated worker); client auth: raw account
   number for now (§3).
2. RESOLVED — pairing 20/h/IP + 10/h/account; challenge 12/h/device +
   60/h/account (§1).
3. RESOLVED — relay is FREE, not metered (owner ruling 2026-11-04); abuse
   control = rate caps. Revisit if costs materialize (§5 metrics will tell).
4. RESOLVED — WebSocket + Durable Objects in a DEDICATED worker
   (`client-relay`, repo rootmyandroid-relay) per owner ruling 2026-11-04,
   for accurate expense/usage tracking.
