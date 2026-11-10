<!-- apps/rootzd/docs/relay-api-todo-2026-11-07.md -->

# Relay/API — remaining work items (handoff to rootmyandroid-api team, 2026-11-07)

Contract source of truth: `apps/rootzd/docs/relay-handoff.md`. This doc lists
only what is still OPEN; it changes nothing in the contract.

Daemon-side status: `rootzd` v26.11.7 (CalVer YY.M.D) — terminal v26.11.7
proven on-device at shell tier (Pixel 5, uid 2000, via `adb forward`). The
v26.11.9 tunnel client (Ed25519 + `wss://relay.rootmyandroid.com/tunnel`)
was the next daemon milestone; the items below are what daemon + portal
clients depend on.

## 1. Kill-switch endpoint (BLOCKER for production pairing)

- `DELETE /v1/relay/devices/<device_id>` — account-level revoke.
- The `relay_devices.revoked_at` column EXISTS and is already honored
  (403/4403 on pair/challenge/tunnel/connect). Missing: the HTTP endpoint
  itself + an explicit un-revoke (re-pair) flow.
- Auth: raw account number bound to the device (same model as contract §3
  client connect). Rate-limit like pairing (20/h/IP, 10/h/account) — the
  account number is the only secret.
- Response codes: 204 revoked; 404 unknown/cross-account (SAME body — no
  existence leak); 429 rate-limited.

## 2. Observability (contract §5)

- Metrics to emit: online devices, tunnel uptime, bytes/frames relayed,
  pairing failures + rate-limit hits, supersede events (close 4000).
- Integrate the first-party analytics pipeline per repo rules (wire-contract
  changes coordinated across repos).

## 3. Halo metering — NO ACTION

- Relay is FREE (owner ruling 2026-11-04); abuse control = the existing rate
  caps. Revisit only if §2 metrics show material cost. Do not build metering.

## 4. Behaviors daemon v26.11.9 will exercise — please confirm

- Supersede-on-reconnect closes the OLD session with 4000 (not 4401) for
  same-device reconnects — confirm.
- Frame cap 64 KiB + 100 frames/second/socket — daemon terminal traffic
  stays far below; confirm these are the enforced numbers.
- Reconnect backoff: the contract says "daemon retries with backoff" without
  a policy — daemon will use exponential backoff 1 s → 60 s cap + jitter;
  flag if the relay wants a documented minimum.
- Challenge TTL 300 s: flag if daemon keygen + first boot on slow flash ever
  proves tight (metrics will show).

## 5. Out of scope for the relay (restated)

- E2E payload encryption is daemon↔client; the relay stays a dumb pipe.
- No LAN mode on the relay (that path is direct client↔daemon).
