// src/lib/scan-report.test.js — Vitest suite for the /scan pure core.
// IMPORTANT (AGENTS.md rule 3): ALL inputs below are SYNTHETIC. They exercise
// parser/detection mechanics only and assert NOTHING about real devices.
// Real-device fixtures (src/lib/fixtures/scan/*.json, HANDOFF.md §10.3) do
// not exist yet (2026-10-29) — add them when the first capture arrives.
import { describe, expect, it } from 'vitest'
import { analyzeDevice, parseGetprop, parsePmListPackages } from './scan-report'

describe('parseGetprop', () => {
  it('parses standard [key]: [value] lines', () => {
    const text = '[ro.product.brand]: [acme]\n[ro.build.version.sdk]: [34]\n'
    expect(parseGetprop(text)).toEqual({
      'ro.product.brand': 'acme',
      'ro.build.version.sdk': '34',
    })
  })

  it('maps empty values to an empty string', () => {
    expect(parseGetprop('[ro.build.tags]: []')).toEqual({ 'ro.build.tags': '' })
  })

  it('skips non-matching lines and tolerates CR line endings', () => {
    const text = '\nADDITIONAL PROPERTIES\n[ro.hardware]: [ranchu]\r\n'
    expect(parseGetprop(text)).toEqual({ 'ro.hardware': 'ranchu' })
  })

  it('keeps bracketed text inside values (greedy match to the last ])', () => {
    expect(parseGetprop('[x]: [a [inner] b]')).toEqual({ x: 'a [inner] b' })
  })
})

describe('parsePmListPackages', () => {
  it('strips the package: prefix and keeps bare IDs', () => {
    const text = 'package:com.topjohnwu.magisk\npackage:com.example.app\n'
    expect(parsePmListPackages(text)).toEqual(['com.topjohnwu.magisk', 'com.example.app'])
  })

  it('skips junk lines and tolerates CR line endings', () => {
    const text = '\nnot-a-package-line\npackage:com.example.app\r\npackage:\n'
    expect(parsePmListPackages(text)).toEqual(['com.example.app'])
  })
})

describe('analyzeDevice', () => {
  const NOW = new Date('2026-10-29T00:00:00Z')

  it('renders every absent key as unknown/null — never an assumption', () => {
    const r = analyzeDevice({ getprop: {} }, { now: NOW })
    expect(r.brand).toBe('unknown')
    expect(r.model).toBe('unknown')
    expect(r.codename).toBe('unknown')
    expect(r.sdk).toBeNull()
    expect(r.securityPatch).toBeNull()
    expect(r.patchAgeDays).toBeNull()
    expect(r.bootloader.state).toBe('unknown')
    expect(r.bootloader.evidence).toEqual([])
    expect(r.oemUnlockAllowed).toBeNull()
    expect(r.verifiedBootState).toBe('unknown')
    expect(r.rootIndicators).toEqual({ heuristic: true, suPresent: false, rootPackages: [] })
  })

  it('maps ro.boot.flash.locked 1/0 to locked/unlocked', () => {
    expect(
      analyzeDevice({ getprop: { 'ro.boot.flash.locked': '1' } }, { now: NOW }).bootloader.state,
    ).toBe('locked')
    expect(
      analyzeDevice({ getprop: { 'ro.boot.flash.locked': '0' } }, { now: NOW }).bootloader.state,
    ).toBe('unlocked')
  })

  it('falls back to unknown when indicators conflict', () => {
    const r = analyzeDevice(
      { getprop: { 'ro.boot.flash.locked': '1', 'ro.boot.vbmeta.device_state': 'unlocked' } },
      { now: NOW },
    )
    expect(r.bootloader.state).toBe('unknown')
    expect(r.bootloader.evidence.join(' ')).toContain('CONFLICT')
  })

  it('reads sys.oem_unlock_allowed as the toggle, not the lock state', () => {
    const r = analyzeDevice({ getprop: { 'sys.oem_unlock_allowed': '1' } }, { now: NOW })
    expect(r.oemUnlockAllowed).toBe(true)
    expect(r.bootloader.state).toBe('unknown')
  })

  it('parses ro.build.version.sdk as an integer; null when unparseable', () => {
    expect(analyzeDevice({ getprop: { 'ro.build.version.sdk': '34' } }, { now: NOW }).sdk).toBe(34)
    expect(analyzeDevice({ getprop: { 'ro.build.version.sdk': 'abc' } }, { now: NOW }).sdk).toBeNull()
  })

  it('computes patch age in whole days from the injected clock', () => {
    const r = analyzeDevice(
      { getprop: { 'ro.build.version.security_patch': '2026-10-01' } },
      { now: NOW },
    )
    expect(r.patchAgeDays).toBe(28)
  })

  it('returns null patch age for an unparseable patch string', () => {
    const r = analyzeDevice(
      { getprop: { 'ro.build.version.security_patch': 'not-a-date' } },
      { now: NOW },
    )
    expect(r.securityPatch).toBe('not-a-date')
    expect(r.patchAgeDays).toBeNull()
  })

  it('flags root heuristics from suPath and known package IDs', () => {
    const r = analyzeDevice(
      {
        getprop: {},
        suPath: '/system/bin/su',
        pmListPackages: ['com.topjohnwu.magisk', 'com.example.app'],
      },
      { now: NOW },
    )
    expect(r.rootIndicators.suPresent).toBe(true)
    expect(r.rootIndicators.rootPackages).toEqual(['com.topjohnwu.magisk'])
    expect(r.rootIndicators.heuristic).toBe(true)
  })

  it('links only to content that exists in this repo', () => {
    // Href set verified on disk 2026-10-29 (see scan-report.ts comments).
    const EXISTING = new Set(['/guides/check-bootloader-status', '/guides/what-is-rooting', '/roms'])
    for (const getprop of [{}, { 'ro.boot.flash.locked': '0' }]) {
      const r = analyzeDevice({ getprop }, { now: NOW })
      expect(r.nextSteps.length).toBeGreaterThan(0)
      for (const s of r.nextSteps) expect(EXISTING.has(s.href)).toBe(true)
    }
  })
})
