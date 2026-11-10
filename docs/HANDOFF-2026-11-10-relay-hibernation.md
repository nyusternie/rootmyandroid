<!-- docs/HANDOFF-2026-11-10-relay-hibernation.md -->

# HANDOFF — relay: DO hibernation strands idle devices (clients get WS 1006)

**To:** relay team (`rootmyandroid-relay`)
**From:** daemon team (`apps/rootzd`)
**Date:** 2026-11-10
**Status:** RESOLVED 2026-11-10 (relay team) — restore-on-wake fix deployed
to production (`rootmyandroid-relay@877b8c5`, Version ID
`96dd44b3-8e78-4f7a-ab92-b8ce226fd4f5`). Details:
`docs/HANDOFF-REPLY-2026-11-10-relay-hibernation.md`. Awaiting the daemon
team's §5 idle-device re-validation.

Per `AGENTS.md` rule 9 this document is the only write channel into the
relay repo. Everything below is verifiable from source paths and the
reproduction commands quoted verbatim.

---

## 0. Context: the rest of the chain is verified live

rootzd v26.11.9 (CI artifact, checksum-verified) on a physical Pixel 5
(redfin, Android 14) against the PRODUCTION relay + API:

| Stage | Result |
| --- | --- |
| `POST /v1/relay/devices` pairing (digits-only account) | ✔ idempotent, marker path works |
| `POST /v1/relay/challenge` + first-message Ed25519 auth | ✔ `authed` |
| E2E handshake (hello → welcome, device-id binding + transcript sig) | ✔ |
| Encrypted stdin → shell → stdout/stderr → exit → close | ✔ exit code 0 |
| session_info | ✔ `tier=shell` AND `tier=root` (both tiers run) |
| Root shell through the tunnel | ✔ `uid=0(root) context=u:r:magisk:s0` |

Driver: `apps/rootzd/tools/e2e-probe.mjs` (new this session — a scriptable
client that self-validates against the pinned cross-implementation fixture
`apps/rootzd/tests/fixtures/e2e-vector.json` before touching the network).

**The one broken link is in the relay: any device idle for more than a
short window (~tens of seconds) can no longer be connected to.**

## 1. Symptom

- Browser `/terminal` (owner-run, 2026-11-10): fields filled, Connect →
  `Disconnected (code 1006).`
- `e2e-probe.mjs`: `FAIL — relay refused the upgrade (code 1006)` —
  the WebSocket upgrade never completes (no `open` event).

1006 = the server refused the upgrade without a WS close frame. Direct
probe of the upgrade (HTTP/1.1, curl with WS headers) shows the actual
response, while the daemon simultaneously holds a healthy tunnel:

```
GET /connect?device=<64-hex>&account=<spaced-or-digits>
→ HTTP/1.1 503 Service Unavailable
  {"ok":false,"error":"device_offline"}
```

Both account formats pass the entry's binding check (see §4 note) — the
503 comes from the Durable Object, not the entry.

## 2. Root cause (relay source citations)

`src/tunnel.js` uses the **WebSocket hibernation API** —
`this.state.acceptWebSocket(server, ['daemon'])` / `['client']` — but
keeps ALL liveness state in constructor fields:

```js
this.daemon = null            // the authenticated daemon socket
this.authTimers = new Map()   // pending-daemon auth deadlines
this.frameCounts = new Map()  // rate-limit windows
this.sessions = new Map()     // telemetry counters (flush key at close)
```

Hibernation semantics: Cloudflare evicts the DO instance while the
accepted **sockets stay alive** (that is the point of the API — the
`webSocketClose` comment in `tunnel.js` cites empirical workerd
verification). On the next event a FRESH DO instance is constructed with
`this.daemon === null`, while the daemon process still believes (and is
told by its own logs) that the tunnel is up — the daemon sends no traffic
while idle, so nothing ever wakes the DO from the daemon side either.

The refusing path (`src/tunnel.js`, `fetch()`):

```js
if (role === 'client') {
  if (!this.daemon) {
    return tunnelError(503, 'device_offline')   // ← post-eviction: always taken
  }
```

**Deadlock:** daemon alive + tunnel socket alive at the edge + DO
instance amnesiac → every client refused → nothing recovers → the daemon
only re-registers when its process restarts (reconnect policy).

## 3. Secondary issues in the same blast radius

1. **A post-eviction daemon frame kills the live socket.**
   `webSocketMessage`: `if (isDaemonSocket && ws !== this.daemon)` →
   `handleDaemonAuth(ws, message)` → the frame is not `{"type":"auth"}`
   → `fail(4401, 'auth_required')` → the relay CLOSES a perfectly valid,
   previously-authenticated daemon socket. Today the daemon is silent
   while idle so this rarely fires; any future daemon-initiated traffic
   (a queued session frame racing eviction) makes it a data-loss path.
2. **Auth timers are lost on eviction.** `authTimers` is in-memory; a
   daemon socket accepted but evicted before authenticating outlives
   `DAEMON_AUTH_TIMEOUT_MS` with no timer to reap it — and if it ever
   sends a frame, it hits issue 1.
3. **Telemetry silently orphaned.** `openTunnelSession` writes the
   `relay_tunnels` row BEFORE `authed` (correct), but the in-memory
   `sessions` entry (the flush key) is wiped by eviction, so
   `closeTunnelSession` never runs for that tunnel: rows stay
   `closed_ts IS NULL` forever. Expect the analytics monitor to see
   "unclosed" tunnel rows for any device that was ever idle.

## 4. Fix direction (your call; constraints noted)

The minimal, cost-neutral fix is **restore-on-wake**: whenever the DO
handles an event and `this.daemon` is null, recover the hibernated socket:

```js
const daemons = this.state.getWebSockets('daemon')  // tags survive eviction
```

…then route it as the established daemon (distinguishing
"previously authenticated" from "accepted but not yet authenticated" —
e.g. via `ws.serializeAttachment()` at auth time, which also solves the
timer-loss issue, and can carry the telemetry `rowId` so close-flush
survives eviction too).

Explicitly NOT recommended without an owner ruling: a daemon-side
heartbeat to keep the DO warm. The `tunnel.js` cost note documents the
owner's expense-tracking ruling — "the DO bills duration only while
sockets are open" — a heartbeat converts that into 24/7 DO billing per
paired device. If a heartbeat is ever wanted, the daemon team owns that
change; do not absorb the cost silently.

(Doc nit already fixed on our side: `apps/web/src/scripts/terminal.ts`
carried a comment claiming the pairing lookup matches the *spaced* account
string. Entry code normalizes (`normalizeAccountNumber`) before comparing
against the stored row, and the daemon pairs digits-only — both formats
work; verified with curl. Comment now reflects this.)

## 5. Workaround until the fix ships

Restart rootzd **immediately** before a client connects (used for every
successful verification run above): the reconnect re-auths on a fresh DO
instance whose `this.daemon` is set, and the client must connect within
the eviction window (~tens of seconds). After the fix lands, tell us and
we will re-run `e2e-probe.mjs` against an idle device to validate — the
probe is deterministic and takes ~10s.
