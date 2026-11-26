// src/lib/harness.ts — /harness page data contract + labeled sample snapshot.
//
// The first version of /harness reads the latest `harness-agents` audit
// snapshot through the EXISTING audit pipeline:
//   POST /v1/device/audit       (device writes; audit_type "harness-agents")
//   POST /v1/device/audit/list  (page reads; audit_type "harness-agents")
// No new API route is required for the snapshot path. A dedicated live
// heartbeat route is the next step (docs/HANDOFF-2026-11-26-harness-page.md).
//
// The snapshot is REGISTRY METADATA ONLY: runtime, model, quantization,
// memory, status, endpoint, heartbeat. It never carries prompts, completions,
// chat history, model weights, files, or shell output.
//
// HARNESS_SAMPLE is deliberately labeled mock data: the page renders it with
// a visible SAMPLE badge until a real snapshot arrives. Model sizes and the
// Pixel 5 RAM anchor are the numbers already verified on /models (Hugging
// Face + /proc/meminfo, 2026-11-11); the agent names, battery, thermal and
// heartbeat values are illustrative.

export type HarnessAgentStatus = 'running' | 'idle' | 'stopped'

export interface HarnessAgent {
  id: string
  name: string
  runtime: string
  model: string
  quantization: string
  parameters_b: number
  context: number
  model_gib: number
  resident_gib: number
  status: HarnessAgentStatus
  endpoint: string | null
  last_heartbeat: string
  capabilities: string[]
}

export interface HarnessDevice {
  id: string
  name: string
  model: string
  android: string
  total_ram_gib: number
  free_ram_gib: number
  thermal: string
  battery_pct: number
  last_sync: string
}

export interface HarnessRuntime {
  name: string
  version: string
  backend: string
  threads: number
  /** Shared harness supervisor overhead, separate from each agent's RSS. */
  overhead_gib: number
}

export interface HarnessSnapshot {
  schema: 1
  collected_at: string
  device: HarnessDevice
  runtime: HarnessRuntime
  agents: HarnessAgent[]
}

export interface HarnessBudget {
  residentGiB: number
  freeGiB: number
  usedPct: number
  headroomGiB: number
}

/**
 * A labeled sample snapshot. The values that are real measurements are the
 * model sizes (Q4_K_M file sizes verified on /models, 2026-11-11) and the
 * Pixel 5 RAM anchor (7.29 GiB total / 3.71 GiB free at idle, /proc/meminfo,
 * 2026-11-11). Everything else is illustrative and must stay behind the
 * page's SAMPLE badge. Scope is the Rootz harness only for now (owner
 * decision 2026-11-26); third-party agents are a later integration.
 */
export const HARNESS_SAMPLE: HarnessSnapshot = {
  schema: 1,
  collected_at: '2026-11-26T18:55:00Z',
  device: {
    id: 'sample-redfin',
    name: 'Pixel 5 (sample)',
    model: 'Pixel 5 (redfin)',
    android: 'Android 14',
    total_ram_gib: 7.29,
    free_ram_gib: 3.71,
    thermal: 'nominal',
    battery_pct: 84,
    last_sync: '2026-11-26T18:55:00Z',
  },
  runtime: {
    name: 'llama.cpp',
    version: 'v0.9.0',
    backend: 'CPU',
    threads: 4,
    overhead_gib: 0.12,
  },
  agents: [
    {
      id: 'rootz-agent',
      name: 'Rootz Agent',
      runtime: 'llama.cpp',
      model: 'Qwen3-4B-Instruct-2507',
      quantization: 'Q4_K_M',
      parameters_b: 4.02,
      context: 8192,
      model_gib: 2.33,
      resident_gib: 2.68,
      status: 'running',
      endpoint: '127.0.0.1:8399',
      last_heartbeat: '2026-11-26T18:55:00Z',
      capabilities: ['read-only audit', 'shell plan', 'tool calls'],
    },
  ],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 200
    ? value
    : null
}

/**
 * Validate an untrusted `snapshot` value from the audit list before the page
 * renders it. Unknown fields are ignored; malformed agents are dropped. A
 * snapshot missing its schema/device/runtime core returns null (the page then
 * keeps the labeled sample and says so).
 */
export function parseHarnessSnapshot(value: unknown): HarnessSnapshot | null {
  if (!isRecord(value) || value.schema !== 1) return null
  const device = isRecord(value.device) ? value.device : null
  const runtime = isRecord(value.runtime) ? value.runtime : null
  if (!device || !runtime || !Array.isArray(value.agents)) return null

  const totalRam = finiteNumber(device.total_ram_gib)
  const freeRam = finiteNumber(device.free_ram_gib)
  const overhead = finiteNumber(runtime.overhead_gib)
  const battery = finiteNumber(device.battery_pct)
  const threads = finiteNumber(runtime.threads)
  const collectedAt = text(value.collected_at)
  const deviceName = text(device.name)
  const deviceModel = text(device.model)
  const android = text(device.android)
  const thermal = text(device.thermal)
  const lastSync = text(device.last_sync)
  const runtimeVersion = text(runtime.version)
  const backend = text(runtime.backend)
  if (
    totalRam === null ||
    freeRam === null ||
    overhead === null ||
    battery === null ||
    threads === null ||
    !collectedAt ||
    !deviceName ||
    !deviceModel ||
    !android ||
    !thermal ||
    !lastSync ||
    !runtimeVersion ||
    !backend
  ) {
    return null
  }

  const agents: HarnessAgent[] = []
  // Cap the rendered registry even if a writer sends more: the snapshot is
  // metadata, and a 16 KiB contract does not need an unbounded DOM.
  for (const raw of value.agents.slice(0, 24)) {
    if (!isRecord(raw)) continue
    const id = text(raw.id)
    const name = text(raw.name)
    const agentRuntime = text(raw.runtime)
    const model = text(raw.model)
    const quantization = text(raw.quantization)
    const parameters = finiteNumber(raw.parameters_b)
    const context = finiteNumber(raw.context)
    const modelGib = finiteNumber(raw.model_gib)
    const residentGib = finiteNumber(raw.resident_gib)
    const status =
      raw.status === 'running' || raw.status === 'idle' || raw.status === 'stopped'
        ? raw.status
        : null
    const lastHeartbeat = text(raw.last_heartbeat)
    if (
      !id ||
      !name ||
      !agentRuntime ||
      !model ||
      !quantization ||
      parameters === null ||
      context === null ||
      modelGib === null ||
      residentGib === null ||
      !status ||
      !lastHeartbeat
    ) {
      continue
    }
    const capabilities = Array.isArray(raw.capabilities)
      ? raw.capabilities
          .filter(
            (cap): cap is string =>
              typeof cap === 'string' && cap.length > 0 && cap.length <= 80,
          )
          .slice(0, 12)
      : []
    agents.push({
      id,
      name,
      runtime: agentRuntime,
      model,
      quantization,
      parameters_b: parameters,
      context,
      model_gib: modelGib,
      resident_gib: residentGib,
      status,
      endpoint: text(raw.endpoint),
      last_heartbeat: lastHeartbeat,
      capabilities,
    })
  }

  return {
    schema: 1,
    collected_at: collectedAt,
    device: {
      id: text(device.id) ?? deviceModel,
      name: deviceName,
      model: deviceModel,
      android,
      total_ram_gib: totalRam,
      free_ram_gib: freeRam,
      thermal,
      battery_pct: battery,
      last_sync: lastSync,
    },
    runtime: {
      name: text(runtime.name) ?? 'llama.cpp',
      version: runtimeVersion,
      backend,
      threads,
      overhead_gib: overhead,
    },
    agents,
  }
}

/**
 * The page's memory readout: resident memory of RUNNING agents plus the
 * shared harness supervisor, against the free RAM the device reported.
 * Idle/stopped agents hold no resident memory in this model.
 */
export function memoryBudget(snapshot: HarnessSnapshot): HarnessBudget {
  const residentGiB =
    snapshot.agents.reduce(
      (sum, agent) =>
        sum + (agent.status === 'running' ? Math.max(0, agent.resident_gib) : 0),
      0,
    ) + Math.max(0, snapshot.runtime.overhead_gib)
  const freeGiB = Math.max(0, snapshot.device.free_ram_gib)
  return {
    residentGiB,
    freeGiB,
    usedPct:
      freeGiB > 0 ? Math.min(100, Math.round((residentGiB / freeGiB) * 100)) : 0,
    headroomGiB: Math.max(0, freeGiB - residentGiB),
  }
}

export function formatGiB(value: number): string {
  return `${value.toFixed(2)} GiB`
}

export function formatContext(tokens: number): string {
  return tokens.toLocaleString('en-US')
}

/** Deterministic "2026-11-26 18:55 UTC" stamp (no locale/ICU drift). */
export function formatStamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

export function statusLabel(status: HarnessAgentStatus): string {
  return status === 'running' ? 'RUNNING' : status === 'idle' ? 'IDLE' : 'STOPPED'
}
