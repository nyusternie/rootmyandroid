<!-- docs/HANDOFF-2026-11-26-harness-page.md -->

# HANDOFF — `/harness`: the on-device AI agent registry

**To:** owner + API team (`rootmyandroid-api`) + Android workstream
**From:** web workstream (`rootmyandroid`, apps/web)
**Date:** 2026-11-26
**Status:** page SHIPPED as a labeled preview; device manifest not yet written.

Per `AGENTS.md` rule 9 this document is the only write channel into a sibling
repo. Nothing below has been applied to `rootmyandroid-api`; the page uses
only routes that already exist.

---

## 1. What shipped

`https://rootmyandroid.com/harness` is a new app page:

- `apps/web/src/pages/harness.astro` — the page, its FAQ + FAQPage JSON-LD,
  and the labeled sample cards.
- `apps/web/src/scripts/harness.ts` — the framework-free sync logic.
- `apps/web/src/lib/harness.ts` — the snapshot contract, the sample, the
  validator, and the memory-budget arithmetic.
- `apps/web/src/lib/harness.test.ts` — pins the sample, the parser, and the
  budget math.

The page is wired to real infrastructure on two legs:

| leg | route | status |
| --- | --- | --- |
| device picker | `POST /v1/relay/devices/list` | LIVE (the same route `/terminal` uses) |
| agent registry | `POST /v1/device/audit/list` with `audit_type: "harness-agents"` | LIVE route; no device writes the snapshot yet |

Until a device writes a `harness-agents` snapshot, the registry is
`HARNESS_SAMPLE` behind a visible **SAMPLE** badge. A real sync replaces it
with the selected device's latest snapshot and the badge becomes **LIVE
SNAPSHOT**. If the account has no snapshot for that device, the page keeps
the sample and says, in the page copy, that it is not a read from the device.

**No new API route was added for this first version.** The existing audit
pipeline already accepts the `harness-agents` audit type (the API's audit-type
pattern is `^[a-z][a-z0-9-]{0,31}$`; see AGENTS.md), and `/guardian` already
uses the same pipeline for `guardian-apps`.

---

## 2. The constraint the page is built around: 8 GB and 4-bit

Measured on our own Pixel 5 (redfin, Android 14, `/proc/meminfo`,
2026-11-11; already published on `/models`):

- 7.29 GiB total RAM (7,640,596 kB)
- 3.71 GiB free at idle (3,893,436 kB)

Q4_K_M is roughly half a byte per parameter. The verified Q4_K_M file sizes
from `/models`:

| model | weights |
| --- | --- |
| Qwen2.5-0.5B-Instruct | 0.46 GiB |
| Qwen2.5-1.5B-Instruct | 1.04 GiB |
| Qwen3-4B-Instruct-2507 | 2.33 GiB |

The sample budget uses 2.68 GiB resident for the running 4B agent (weights +
its runtime/KV) plus 0.12 GiB for the harness supervisor: 2.80 GiB of 3.71
GiB, leaving 0.91 GiB. That fits the 0.5B agent (0.46 + a sample 0.35 GiB
runtime/KV estimate = 0.81 GiB) but not the 1.5B (1.39 GiB). **On 8 GB, one
4B model at a time is the practical shape; the page shows the budget rather
than pretending every installed agent can run at once.**

The 0.35 GiB per-agent KV/runtime figure is an explicitly labeled estimate,
not a measurement. Only the model sizes and the RAM anchor are verified.

---

## 3. Options for the sync model (the discussion)

### Option A — reuse the audit pipeline (SHIPPED)

Device writes `audit_type: "harness-agents"` to `POST /v1/device/audit`;
page reads the latest row from `POST /v1/device/audit/list`.

- **Pros:** no API work; existing account auth, rate limits, storage and
  list route; `/guardian` precedent; the page can ship today.
- **Cons:** snapshot, not live status; last-write-wins; no heartbeat TTL;
  no start/stop; the audit table accumulates rows; a device that never
  writes is indistinguishable from a device with no agents.
- **Fit:** the first version, and a stable fallback even after a dedicated
  route ships.

### Option B — a dedicated harness route (RECOMMENDED NEXT)

Proposed contract:

- `POST /v1/harness/heartbeat` — the device writes its current registry
  (same snapshot shape, plus a server-side `received_at`); upsert one row
  per device.
- `POST /v1/harness/agents/list` — the page reads the latest row for
  `{ account_number, device_id }`.
- Optional `POST /v1/harness/agents/refresh` — asks the device for a fresh
  snapshot through the relay (see Option C) instead of waiting for the next
  heartbeat.

- **Pros:** live status with a TTL; one row per device; explicit schema;
  easy to add `stale` / `last_seen` semantics; no audit-table growth.
- **Cons:** API + D1 work, deploy, rate limits, a new contract to keep in
  sync with the device app.
- **Fit:** the right home once the device app ships the manifest.

### Option C — live pull through the relay (LATER)

The browser asks the device through the relay for a `harness.status`
command, on demand.

- **Pros:** truly live; no stored snapshot.
- **Cons:** requires a daemon command, a relay/browser protocol, the device
  awake and reachable, timeout/error UX, and a larger privileged surface.
  It also makes the page depend on the relay being up, which the snapshot
  path does not.
- **Fit:** an explicit “Refresh from device” button later, not the default.

### Option D — direct LAN endpoint (REJECTED for the public web page)

A phone-local HTTP endpoint (`127.0.0.1:8399`) is not reachable from a public
HTTPS page, and a LAN address would need discovery, CORS, and mixed-content
handling. Rejected for the web page; the on-device app can still use it.

**Recommendation:** A now (shipped), B next for heartbeat/TTL, C only as an
explicit refresh action if the owner wants it. Keep the page read-only in
all three: no start/stop, no model switching, no shell.

---

## 4. Proposed `harness-agents` snapshot v1

The full sample is in `apps/web/src/lib/harness.ts` and rendered in the
page's “Proposed snapshot” `<details>`. Field contract:

| field | type | rule |
| --- | --- | --- |
| `schema` | number | `1` |
| `collected_at` | ISO 8601 string | when the device collected it |
| `device.id` | string | **MUST equal the relay `device_id`** (64 hex) or the page cannot match the row to the picker |
| `device.name` | string | human label |
| `device.model` | string | e.g. `Pixel 5 (redfin)` |
| `device.android` | string | e.g. `Android 14` |
| `device.total_ram_gib` | number | GiB |
| `device.free_ram_gib` | number | GiB at collection time |
| `device.thermal` | string | device-reported state |
| `device.battery_pct` | number | 0–100 |
| `device.last_sync` | ISO 8601 string | last successful sync |
| `runtime.name` | string | e.g. `llama.cpp` |
| `runtime.version` | string | e.g. `v0.9.0` |
| `runtime.backend` | string | e.g. `CPU` |
| `runtime.threads` | number | configured threads |
| `runtime.overhead_gib` | number | shared supervisor overhead |
| `agents[].id` | string | stable per agent |
| `agents[].name` | string | display name |
| `agents[].runtime` | string | e.g. `llama.cpp` |
| `agents[].model` | string | model name |
| `agents[].quantization` | string | e.g. `Q4_K_M` |
| `agents[].parameters_b` | number | billions of parameters |
| `agents[].context` | number | configured context tokens |
| `agents[].model_gib` | number | weights on disk |
| `agents[].resident_gib` | number | current RSS; `0` when not resident |
| `agents[].status` | string | `running` \| `idle` \| `stopped` |
| `agents[].endpoint` | string \| null | device-local endpoint or `null` |
| `agents[].last_heartbeat` | ISO 8601 string | agent heartbeat |
| `agents[].capabilities` | string[] | short labels, max 12 |

**Hard rules for the writer:**

- Registry metadata only. No prompts, completions, chat history, model
  weights, files, shell output, or user identifiers.
- Proposed size cap: 16 KiB for the whole snapshot. A device with more
  agents should truncate capabilities, not grow the payload.
- `device.id` must be the relay device id, not a fresh UUID. The page's
  picker and the snapshot must join on that value.
- The page is read-only. A snapshot never carries a command or an action.

---

## 5. Open questions for the owner

1. **Scope of “installed agents.”** Only our own Rootz harness, or also
   third-party local-model apps? An app can report its own runtime; another
   app's internal runtime needs a defined integration (or a privileged path)
   that we have not chosen or verified. Do not promise third-party discovery
   until the integration exists.
2. **Endpoints.** Show `127.0.0.1:8399`-style endpoints on the page, or hide
   them behind a disclosure? The sample shows them; they are device-local,
   but the owner may prefer not to publish them.
3. **Heartbeat interval and staleness.** Option B needs a TTL (for example,
   “stale after N minutes”). No interval is ruled yet; do not hard-code one
   in copy.
4. **Start/stop or model switching.** v1 is read-only. If the Harness should
   ever start/stop an agent, that is a new privileged surface and needs an
   explicit owner ruling plus a relay/daemon design.
5. **Cost/usage.** Does the Harness show tokens or GURU spend per agent, or
   does that stay on the Gurus/billing surface? The snapshot contract above
   deliberately omits cost.
6. **Multi-user / work profile.** One snapshot per device, or one per
   Android user? The audit pipeline keys on `device_id` today.
7. **Model trust.** Should the snapshot include a model file hash or license?
   Useful for trust, but it grows the payload and needs a device-side
   implementation.
8. **Reference device.** The page uses the measured Pixel 5 numbers as the
   anchor. Confirm that is the device the copy should keep naming.

---

## 6. Verification

- **No host build** (AGENTS.md build rule): CI on `blackhost` runs
  `check → test:coverage → build`; the page is static and the new unit tests
  cover the snapshot parser and budget arithmetic.
- Local, non-build checks run before the commit: the styling gate
  (`tools/check-web-styling.mjs`), the pinned-version gate, and the targeted
  Vitest files (`harness.test.ts`, `ai-surfaces.test.js`, `api.test.js`).
- The page's sample is labeled in three places: the hero PREVIEW badge, the
  registry SAMPLE badge, and the registry note. A real sync changes the badge
  to LIVE SNAPSHOT and the note to the collected timestamp.
