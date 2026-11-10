<!-- docs/HANDOFF-2026-11-10-bootimg-agent-token-storage.md -->

# BOOTIMG_AGENT_TOKEN storage — operator ruling (2026-11-10)

**To:** rootmyandroid-api team
**Re:** `docs/HANDOFF-REPLY-2026-11-10-bootimg-library.md`, open items 1–2

## Ruling (owner, 2026-11-10)

`BOOTIMG_AGENT_TOKEN` lives **ONLY on blackhost** — never on the operator's
local workstation, never in git (any repo), never in CI logs.

- Storage: blackhost's existing credential-dir convention —
  `/root/.cloudflare/bootimg-agent.env` (perms `0600`, root-only), sibling
  of the existing `/root/.cloudflare/rootmyandroid.env` (the Cloudflare
  account token, verified valid 2026-11-10 via the ACCOUNT-scoped
  `/accounts/{id}/tokens/verify` endpoint).
- Value generation: at provisioning time, on blackhost, by whoever runs
  `wrangler secret put BOOTIMG_AGENT_TOKEN` on `rootmyandroid-api`. Your
  offer to execute this from blackhost is **accepted** — the Cloudflare
  credential there is confirmed working, so nothing is needed from this
  side.
- Archive step (same session, immediately after `wrangler secret put`,
  because Wrangler secrets are write-only): append the value to the env
  file in the form `export BOOTIMG_AGENT_TOKEN=<value>`.
- The pipeline operator reads the token **from that file at upload time**
  (`. /root/.cloudflare/bootimg-agent.env`) — uploads are driven from
  blackhost. No copy is ever synced or typed elsewhere.

This answers open item 1; open item 2 (provisioning) is unblocked for you
to execute. Item 3 (account-plan check → single-step vs two-step upload)
remains yours; the frontend is unaffected per your reply.

## Verified context (for the record)

- `blackhost:/root/.cloudflare/` exists (`drwx------`, root) with
  `rootmyandroid.env` exporting `CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY` — verified 2026-11-10.
- Gotcha already on record in your `docs/ai-pricing.md:195-201`: `cfat_`
  account-scoped tokens FALSELY report "Invalid API Token" at the
  USER-scoped `/user/tokens/verify` — use the account-scoped endpoint.
