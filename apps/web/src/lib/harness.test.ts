// src/lib/harness.test.ts — pins the /harness snapshot contract, the sample
// budget arithmetic, and the formatting helpers. The page renders the sample
// behind a SAMPLE badge; these tests keep that sample and the parser honest.
import { describe, expect, it } from 'vitest'
import {
  HARNESS_SAMPLE,
  formatContext,
  formatGiB,
  formatStamp,
  memoryBudget,
  parseHarnessSnapshot,
  statusLabel,
} from './harness'

describe('HARNESS_SAMPLE', () => {
  it('is schema v1 with the Rootz harness sample agent', () => {
    expect(HARNESS_SAMPLE.schema).toBe(1)
    expect(HARNESS_SAMPLE.device.name).toContain('sample')
    expect(HARNESS_SAMPLE.agents.map((agent) => agent.name)).toEqual([
      'Rootz Agent',
    ])
  })

  it('uses the verified 8 GB Pixel 5 RAM anchor', () => {
    // /models: 7,640,596 kB total, 3,893,436 kB free at idle (2026-11-11).
    expect(HARNESS_SAMPLE.device.total_ram_gib).toBe(7.29)
    expect(HARNESS_SAMPLE.device.free_ram_gib).toBe(3.71)
  })

  it('keeps the running 4B agent inside the free-RAM budget', () => {
    const budget = memoryBudget(HARNESS_SAMPLE)
    // 2.68 GiB agent RSS + 0.12 GiB supervisor = 2.80 GiB of 3.71 GiB.
    expect(budget.residentGiB).toBeCloseTo(2.8, 5)
    expect(budget.freeGiB).toBe(3.71)
    expect(budget.headroomGiB).toBeCloseTo(0.91, 5)
    expect(budget.usedPct).toBe(75)
  })

  it('does not count idle or stopped agents as resident', () => {
    const withIdleResident = {
      ...HARNESS_SAMPLE,
      agents: [
        ...HARNESS_SAMPLE.agents,
        {
          ...HARNESS_SAMPLE.agents[0],
          id: 'idle-agent',
          status: 'idle' as const,
          resident_gib: 99,
        },
      ],
    }
    expect(memoryBudget(withIdleResident).residentGiB).toBeCloseTo(2.8, 5)
  })
})

describe('parseHarnessSnapshot', () => {
  it('accepts the sample after a JSON round-trip', () => {
    const parsed = parseHarnessSnapshot(JSON.parse(JSON.stringify(HARNESS_SAMPLE)))
    expect(parsed).not.toBeNull()
    expect(parsed?.agents).toHaveLength(1)
    expect(parsed?.device.free_ram_gib).toBe(3.71)
  })

  it('rejects a missing schema, device, runtime, or agent list', () => {
    expect(parseHarnessSnapshot(null)).toBeNull()
    expect(parseHarnessSnapshot({ ...HARNESS_SAMPLE, schema: 2 })).toBeNull()
    expect(parseHarnessSnapshot({ ...HARNESS_SAMPLE, device: null })).toBeNull()
    expect(parseHarnessSnapshot({ ...HARNESS_SAMPLE, runtime: null })).toBeNull()
    expect(parseHarnessSnapshot({ ...HARNESS_SAMPLE, agents: 'nope' })).toBeNull()
  })

  it('drops malformed agent rows instead of failing the whole snapshot', () => {
    const parsed = parseHarnessSnapshot({
      ...HARNESS_SAMPLE,
      agents: [HARNESS_SAMPLE.agents[0], { id: 'broken' }, null],
    })
    expect(parsed?.agents).toHaveLength(1)
    expect(parsed?.agents[0].name).toBe('Rootz Agent')
  })

  it('caps an oversized registry at 24 agents', () => {
    const parsed = parseHarnessSnapshot({
      ...HARNESS_SAMPLE,
      agents: Array.from({ length: 40 }, (_, i) => ({
        ...HARNESS_SAMPLE.agents[0],
        id: `agent-${i}`,
      })),
    })
    expect(parsed?.agents).toHaveLength(24)
  })

  it('keeps a null endpoint (stopped agent) and truncates capability lists', () => {
    const parsed = parseHarnessSnapshot({
      ...HARNESS_SAMPLE,
      agents: [
        {
          ...HARNESS_SAMPLE.agents[0],
          status: 'stopped' as const,
          endpoint: null,
          capabilities: Array.from({ length: 20 }, (_, i) => `cap-${i}`),
        },
      ],
    })
    expect(parsed?.agents[0].endpoint).toBeNull()
    expect(parsed?.agents[0].capabilities).toHaveLength(12)
  })
})

describe('formatting helpers', () => {
  it('formats GiB and context with two decimals / thousands separators', () => {
    expect(formatGiB(2.33)).toBe('2.33 GiB')
    expect(formatGiB(0)).toBe('0.00 GiB')
    expect(formatContext(8192)).toBe('8,192')
  })

  it('formats an ISO timestamp deterministically in UTC', () => {
    expect(formatStamp('2026-11-26T18:55:00Z')).toBe('2026-11-26 18:55 UTC')
    expect(formatStamp('not-a-date')).toBe('not-a-date')
  })

  it('labels all three agent states', () => {
    expect(statusLabel('running')).toBe('RUNNING')
    expect(statusLabel('idle')).toBe('IDLE')
    expect(statusLabel('stopped')).toBe('STOPPED')
  })
})
