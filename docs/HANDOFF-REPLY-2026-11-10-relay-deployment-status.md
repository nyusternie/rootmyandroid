<!-- docs/HANDOFF-REPLY-2026-11-10-relay-deployment-status.md -->

# Relay deployment status — REPLY (2026-11-10)

**To:** rootzd / client team
**Re:** `docs/HANDOFF-2026-11-10-relay-deployment-status.md`

## Verdict: ALL THREE ASKS CLOSED — relay is DEPLOYED and LIVE

### Ask 1 — deploy `client-relay` ✅ DONE

- Deployed from blackhost (`/root/work/rootmyandroid-relay`, HEAD ==
  origin/main == `f5a9e77` — your fact #1 triangulated and re-confirmed
  today).
- Deployment created **2026-11-10T15:35:41Z**; it is the ONLY deployment
  on the worker (verified via `wrangler deployments list` — nobody has
  deployed over it since).
- Route `relay.rootmyandroid.com/*` on zone `rootmyandroid.com` attached
  at deploy time; the proxied AAAA placeholder record (`relay` → `100::`)
  was created via the Cloudflare API the same day.
- Bindings live: `TUNNEL` (DeviceTunnel DO, SQLite-backed — your
  code-10099 note is why `f5a9e77` switched the migration to
  `new_sqlite_classes`; safe because no KV-backed namespace ever existed),
  `DB` (rootmyandroid-db), `ANALYTICS_DB` (rootmyandroid-analytics —
  telemetry rows accrue per the observability doc,
  `apps/rootzd/docs/relay-api-reply-2026-11-09.md` §6).

### Ask 2 — `GET /health` → 200 ✅ CONFIRMED

```
$ curl https://relay.rootmyandroid.com/health        (from blackhost)
{"ok":true,"service":"client-relay"}                  [HTTP 200]
```

`/health` has existed in `src/index.js` since the initial commit — no code
change was needed for this ask.

### Ask 3 — reply with the result ✅ this document

## Production smoke results (all read-only, run from blackhost today)

| Check | Result |
|---|---|
| `GET /health` | **200** `{"ok":true,"service":"client-relay"}` |
| `GET /` | 200 service index (endpoints list) |
| `GET /connect` without WS headers | 426 `upgrade_required` (correct) |
| `GET /connect?device=<unknown 64-hex>&account=<valid 16-digit>` (WS handshake) | **404 `device_not_found`** — proves production **D1 read** (`findRelayDevice`), device-id + account validation, and the existence-hiding 404 |
| `GET /tunnel?device=<unknown 64-hex>` (WS handshake) | **404 `device_not_found`** — daemon path DB read |
| `GET /connect?account=12345` (WS handshake) | 400 `invalid_account_number` (validation order per `src/index.js`) |

No test devices/accounts were created in production — every check above is
a read.

## About your NXDOMAIN symptom

The DNS record was created 2026-11-10 ~15:36Z and verified resolving via
DNS-over-HTTPS against 1.1.1.1 the same hour (NOERROR, AAAA → Cloudflare
edge), plus the live 200s above from blackhost. Your `getent` at ~16:00
UTC was hitting a **negative cache** from before the record existed. If
any box still NXDOMAINs: flush its cache (`resolvectl flush-caches` /
nscd restart) or wait out the zone SOA negative TTL — the record itself is
live and correct.

## One repro gotcha for your own testing

curl's WS-handshake repro must use **`--http1.1`**. Over HTTP/2 (curl's
default), the Cloudflare edge does not pass the classic Upgrade handshake
through and the worker answers 426 `upgrade_required` — which can look
like a broken deployment. Real clients (browsers' `new WebSocket()`,
tokio-tungstenite) speak HTTP/1.1 upgrade natively and are unaffected.

## Your verified facts — confirmed

- Client hard-points: `apps/rootzd/src/relay.rs:33` and
  `apps/web/src/scripts/terminal.ts:23` — both exact, both as quoted.
- Relay suite **27/27 on blackhost at `f5a9e77`** — re-run by us today,
  confirmed.
- Token-verify endpoint nuance (account-scoped `/accounts/{id}/tokens/verify`
  vs the user-scoped false-negative for `cfat_` tokens) — acknowledged,
  matches `docs/ai-pricing.md:195-201`; no action needed.

## Not conflated

The device-picker list-devices blocker is a separate open item, as your
note says — untouched here.

**The relay is ready for rootzd on-device verification and the `/terminal`
end-to-end loop. No further action on our side.**
