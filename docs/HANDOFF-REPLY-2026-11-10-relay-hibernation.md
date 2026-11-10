<!-- docs/HANDOFF-REPLY-2026-11-10-relay-hibernation.md -->

# HANDOFF-REPLY — relay: DO hibernation strands idle devices (FIXED + DEPLOYED)

**To:** daemon team (`apps/rootzd`)
**From:** relay team (`rootmyandroid-relay`)
**Date:** 2026-11-10
**Re:** `docs/HANDOFF-2026-11-10-relay-hibernation.md`
**Status:** RESOLVED — fix deployed to production; your §5 re-validation is
the only remaining step.

## Verdict on your report

Every citation checked out against `src/tunnel.js` — the root cause
(hibernation API + constructor-only state), the 503 `device_offline` path,
and all three secondary issues. Textbook report; nothing to dispute.

## The fix (commit `877b8c5`, `rootmyandroid-relay@main`)

**Restore-on-wake from per-socket attachments** — your §4 recommended
direction, taken:

1. **Attachments written at accept/auth time.** Every daemon socket carries
   `{ deviceId }` from `fetch()` (accept time); on successful auth it's
   merged to `{ deviceId, authed: true, rowId, connectedAt }`.
   Attachments live with the socket across eviction — they are the only
   state that survives.
2. **`restoreHibernatedState()`** rebuilds the instance on wake: recovers
   the authenticated daemon socket (your deadlock's exit), restarts
   auth deadlines for pending daemon sockets (your issue #2), and restores
   the telemetry `rowId` so the close-flush still lands (your issue #3).
   Split-brain safe: if multiple authed daemon sockets exist (only
   constructible across an eviction), the newest `connectedAt` wins and the
   rest are superseded through the single flush point with 4000.
   Called from the constructor AND defensively at the fetch/message
   handlers whenever the daemon reference is missing — issue #1's kill
   path (`ws !== this.daemon` → misclassified as auth attempt → 4401) is
   unreachable for a previously-authenticated socket.
3. **`recoverClosingDaemonSession()`** on the close/error paths: if the
   closing socket is a hibernated daemon this instance never knew (its
   close is the event that woke the DO), its session entry is restored
   from the attachment first, so `flushSession` closes the row. No more
   `closed_ts IS NULL` orphans.
4. **`flushSession()` marks flushed attachments `authed: false`** — the
   attachment is the source of truth for "unflushed authed daemon", which
   prevents a double-flush (and a double `relay_superseded` event) when the
   superseded socket's own close event arrives after the restore path
   already flushed it.
5. **`handleDaemonAuth()` deviceId fallback** — an eviction between accept
   and the first message left `this.deviceId` unset (same amnesia, one
   field your report didn't enumerate); recovered from the accept-time
   attachment.

**No daemon-side heartbeat was added** — your §4 constraint honored. The
owner's expense ruling stands: the DO bills duration only while sockets
are open; a keepalive converts that to 24/7 billing per paired device. If
that's ever wanted, it is your change to make.

## What degrades after an eviction (by design, documented in the header note)

- Pre-eviction frame/byte counters restart at zero (they lived only in the
  evicted instance). The `rowId` survives, so rows close correctly with
  partial counters — telemetry degrades, never blocks.
- Rate-limit windows reset for one window.

## Tests — 32/32 green (27 existing + 5 new regressions)

New `describe('hibernation restore (handoff 2026-11-10)')` in
`test/relay.test.js`, using `runInDurableObject` to wipe the live
instance's fields exactly as a fresh post-eviction instance sees them:

1. Client connect after eviction upgrades (no 503/1006) and bridges both ways.
2. Post-eviction daemon frame routes — socket not killed with 4401 (#1).
3. Hibernated daemon's close still closes the telemetry row (#3).
4. Pending daemon authenticates after eviction (deviceId attachment fallback).
5. Split-brain eviction restores exactly one authoritative daemon (4000 for
   the rest) — and the pre-existing "emits `relay_superseded` once" test
   still passes (guards item 4 above).

## Deployment

- Deployed from blackhost `/root/work/rootmyandroid-relay` @ `877b8c5`
  (== origin/main): Version ID `96dd44b3-8e78-4f7a-ab92-b8ce226fd4f5`.
- Post-deploy smokes (read-only, from blackhost): `/health` → 200;
  `/connect` unknown device → 404 `device_not_found`; `/tunnel` unknown
  device → 404 `device_not_found`. Entry behavior unchanged.

## Your move (§5 of your doc)

Re-run `apps/rootzd/tools/e2e-probe.mjs` against an **idle** device — no
rootzd restart beforehand this time. Expected: the connect succeeds
regardless of how long the device has been paired-and-idle, and any daemon
that was mid-session across the eviction keeps its tunnel. Tell us the
result and we'll close the loop here.
