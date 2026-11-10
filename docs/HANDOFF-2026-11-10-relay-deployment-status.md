<!-- docs/HANDOFF-2026-11-10-relay-deployment-status.md -->

# Relay deployment status request (2026-11-10)

**To:** rootmyandroid-api team
**Re:** `client-relay` worker (rootmyandroid-relay repo — yours to deploy;
this document is a status request, not a change request)

## Verified symptom

`relay.rootmyandroid.com` does not resolve — `getent hosts
relay.rootmyandroid.com` exit 2 (NXDOMAIN), checked 2026-11-10 ~16:00 UTC.
Both shipped clients hard-point at it:

- daemon: `apps/rootzd/src/relay.rs:33` —
  `DEFAULT_RELAY = "wss://relay.rootmyandroid.com/tunnel"`
- web client: `apps/web/src/scripts/terminal.ts:23` —
  `RELAY_CONNECT = "wss://relay.rootmyandroid.com/connect"`

This is the critical-path blocker for: rootzd on-device verification and
the `/terminal` end-to-end loop. (The device picker's list-devices
endpoint is a SEPARATE open blocker from the earlier handoff — do not
conflate.)

## Facts that make your deploy quick (all verified 2026-11-10)

1. The relay repo's latest commit `f5a9e77` fixes the DO migration to
   `new_sqlite_classes` (the account's code-10099 rejection of KV-backed
   DO namespaces that killed the first deploy attempt today). It is
   pushed; blackhost's checkout at `/root/work/rootmyandroid-relay` has it
   (HEAD == origin/main == `f5a9e77`, triangulated).
2. The relay's own vitest suite passes **27/27** on blackhost at
   `f5a9e77` (daemon auth handshake, single-use challenge replay
   rejection, supersede with 4000, telemetry flush). Suite run was
   read-only — nothing was deployed.
3. blackhost's Cloudflare account token
   (`/root/.cloudflare/rootmyandroid.env`) is **active** — verified via
   the ACCOUNT-scoped `/accounts/{id}/tokens/verify` endpoint (HTTP 200).
   ⚠️ Reminder from your own `docs/ai-pricing.md:195-201`: `cfat_`
   account tokens falsely report "Invalid API Token" at the USER-scoped
   `/user/tokens/verify` — use the account-scoped endpoint.

## Ask

1. Deploy `client-relay` (`wrangler deploy` from the relay repo). Its
   `wrangler.jsonc` already declares the route
   `relay.rootmyandroid.com/*` on zone `rootmyandroid.com`; the DNS record
   is auto-provisioned with the route on an active zone.
2. Confirm liveness: `GET https://relay.rootmyandroid.com/health` → 200.
3. Reply here (or in your own HANDOFF-REPLY doc) with the result.

No client-side changes are needed once `/health` answers — the daemon and
web client already speak the final protocol (E2E envelope over the opaque
frame bridge, `apps/rootzd/docs/e2e-protocol.md`, cross-implementation
vector test green on both sides).
