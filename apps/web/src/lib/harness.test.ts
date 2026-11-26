// src/lib/harness.test.ts — pins the /harness snapshot contract, the sample
// budget arithmetic, and the formatting helpers. The page renders the sample
// behind a SAMPLE badge; these tests keep that sample and the parser honest.
import { describe, expect, it } from 'vitest'
import {
  HARNESS_SAMPLE,
  formatAge,
  formatContext,
  formatGiB,
  formatStamp,
  isAccountNotFound,
  memoryBudget,
  parseHarnessSnapshot,
  readHarnessRouteResponse,
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

describe('readHarnessRouteResponse', () => {
  it('reads the §5 response shape', () => {
    const route = readHarnessRouteResponse({
      ok: true,
      snapshot: HARNESS_SAMPLE,
      received_at: '2026-11-26T19:00:00Z',
    })
    expect(route?.snapshot.agents).toHaveLength(1)
    expect(route?.receivedAt).toBe('2026-11-26T19:00:00Z')
  })

  it('accepts a bare snapshot and a missing received_at', () => {
    const route = readHarnessRouteResponse(HARNESS_SAMPLE)
    expect(route?.snapshot.schema).toBe(1)
    expect(route?.receivedAt).toBeNull()
  })

  it('rejects a payload with no valid snapshot', () => {
    expect(readHarnessRouteResponse(null)).toBeNull()
    expect(readHarnessRouteResponse({ ok: true, snapshot: null })).toBeNull()
    expect(readHarnessRouteResponse({ snapshot: { schema: 2 } })).toBeNull()
  })
})

describe('isAccountNotFound', () => {
  it('distinguishes the account 404 from the no-snapshot 404', () => {
    expect(isAccountNotFound({ ok: false, error: 'account_not_found' })).toBe(true)
    expect(
      isAccountNotFound({ ok: false, error: 'harness_snapshot_not_found' }),
    ).toBe(false)
    expect(isAccountNotFound(null)).toBe(false)
    expect(isAccountNotFound({ ok: false })).toBe(false)
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

  it('formats a coarse age against a fixed now', () => {
    const now = new Date('2026-11-26T19:10:00Z')
    expect(formatAge('2026-11-26T19:09:30Z', now)).toBe('just now')
    expect(formatAge('2026-11-26T19:05:00Z', now)).toBe('5 min ago')
    expect(formatAge('2026-11-26T17:10:00Z', now)).toBe('2 h ago')
    expect(formatAge('2026-11-24T19:10:00Z', now)).toBe('2 d ago')
    expect(formatAge('not-a-date', now)).toBe('')
  })

  it('labels all three agent states', () => {
    expect(statusLabel('running')).toBe('RUNNING')
    expect(statusLabel('idle')).toBe('IDLE')
    expect(statusLabel('stopped')).toBe('STOPPED')
  })
})
