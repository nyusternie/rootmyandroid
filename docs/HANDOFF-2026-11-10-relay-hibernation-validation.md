<!-- docs/HANDOFF-2026-11-10-relay-hibernation-validation.md -->

# VALIDATION — relay hibernation fix: CONFIRMED in production

**To:** relay team (`rootmyandroid-relay`)
**From:** daemon team (`apps/rootzd`)
**Date:** 2026-11-10
**Re:** `docs/HANDOFF-REPLY-2026-11-10-relay-hibernation.md` (your
`877b8c5`, Version ID `96dd44b3-8e78-4f7a-ab92-b8ce226fd4f5`)
**Status:** CLOSED from our side — both §5 test shapes pass against an
idle physical device with no daemon restart.

Driver: `apps/rootzd/tools/e2e-probe.mjs` (fixture-self-validating client)
against rootzd v26.11.9 on Pixel 5 (redfin, Android 14), root tier
(`uid=0`), paired to a free-tier account. Same device/session parameters
that produced the original 503/1006 failure — this is a controlled A/B
across your deploy.

## Test matrix

| # | Shape | Method | Result |
| --- | --- | --- | --- |
| A | **Paired-and-idle connect** | Tunnel left idle far past the eviction window (est. minutes; eviction observed at ~tens of seconds), then plain probe run — NO daemon restart | ✔ exit 0: upgrade → hello → welcome → session_info → root shell output → exit frame → close |
| B | **Mid-session eviction** | Probe handshake, then 75s of silence (new `--idle-before-cmd 75` flag), then stdin | ✔ exit 0: the client frame woke the DO, restore reattached the daemon, command executed, output returned, session closed cleanly |

Daemon-side corroboration (device log): normal session lifecycle only —
`session up → shell exited (code Some(0)) → closed by client`, with **no**
tunnel drop and **no** 4401 between sessions, validating your issue-#1
claim (post-eviction daemon frames route; the authenticated socket is
never re-challenged) in production.

## Your claims vs. our verification

- ✔ Fix live and behaviorally correct (tests A+B above).
- ✔ No daemon-side heartbeat — confirmed unnecessary; idle connect is now
  instant.
- Not independently verified (your internal evidence; superseded by the
  behavioral proof): 32/32 suite, Version ID, post-deploy smokes.

## One edge case we could not construct (note, not a blocker)

Tunnels established by PRE-fix DO code carry no socket attachment; after
eviction their restore has nothing to find. Expected behavior there is
the old 503/1006 until the daemon's next natural reconnect (which
re-auths against post-fix code WITH attachments). Self-healing on any
reconnect cycle; only observable for devices that stay tunnel-up
continuously across the deploy. Not seen on redfin (its tunnel reconnected
during your deploy window — `Connection reset by peer` → immediate
re-auth, per the reconnect policy).

Nice work — the restore-on-wake design (attachments as the single source
of truth, split-brain newest-wins through the single flush point) holds
under real eviction. `/terminal` is usable by real users now.
