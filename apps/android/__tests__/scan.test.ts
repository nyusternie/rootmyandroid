// apps/android/__tests__/scan.test.ts — fixture + synthetic tests for the
// scan rules engine (scan.ts, ported from apps/web/src/lib/scan-report.ts).
// The redfin fixture was captured from the live device over USB adb
// (2026-11-13) — CI has no USB device, so fixtures carry the device truth.
import { analyzeScan, bootloaderLabel, bootloaderTone, integrityTone, parseGetprop } from '../scan';
import type { RawScanFacts } from '../scan';
import fixture from './fixtures/scan/redfin-2026-11-13.json';

const rawFixture = fixture.raw as RawScanFacts;

test('redfin 2026-11-13 fixture: rooted device, unlocked bootloader', () => {
  // Patch-age math is time-dependent — inject the capture date.
  const r = analyzeScan(rawFixture, { now: new Date('2026-11-13T00:00:00Z') });
  expect(r.model).toBe('Pixel 5 (redfin)');
  expect(r.manufacturer).toBe('Google');
  expect(r.brand).toBe('google');
  expect(r.codename).toBe('redfin');
  expect(r.hardware).toBe('redfin');
  expect(r.abi).toBe('arm64-v8a');
  expect(r.buildTags).toBe('release-keys');
  expect(r.fingerprint).toBe(
    'google/redfin/redfin:14/UP1A.231105.001.B2/11260668:user/release-keys',
  );
  expect(r.android).toBe('14 (SDK 34)');
  expect(r.build).toBe('UP1A.231105.001.B2');
  expect(r.securityPatch).toBe('2023-11-05');
  expect(r.patchAgeDays).toBeGreaterThan(1000);
  expect(r.bootloader).toBe('unlocked');
  expect(r.bootloaderEvidence).toContain('ro.boot.flash.locked=0');
  expect(r.bootloaderEvidence).toContain('ro.boot.vbmeta.device_state=unlocked');
  expect(r.verifiedBootState).toBe('orange');
  expect(r.oemUnlockAllowed).toBe(true);
  expect(r.rooted).toBe(true);
  expect(r.rootedEvidence).toEqual(
    expect.arrayContaining([
      'su binary on PATH: /product/bin/su (heuristic root indicator)',
      'Root app installed: com.topjohnwu.magisk (heuristic)',
    ]),
  );
  expect(r.integrity).toBe('Failing (unlocked bootloader)');
  expect(integrityTone(r.integrity)).toBe('warn');
  expect(bootloaderLabel(r.bootloader)).toBe('Unlocked');
  expect(bootloaderTone(r.bootloader)).toBe('warn');
  expect(Object.keys(r.props)).toHaveLength(758);
  expect(r.props['ro.product.model']).toBe('Pixel 5');
});

test('absent keys render unknown — never assumptions', () => {
  const r = analyzeScan({ getprop: {}, suPath: null, rootPackages: [] });
  expect(r.model).toBe('unknown (unknown)');
  expect(r.manufacturer).toBe('unknown');
  expect(r.fingerprint).toBe('unknown');
  expect(r.securityPatch).toBeNull();
  expect(r.patchAgeDays).toBeNull();
  expect(r.bootloader).toBe('unknown');
  expect(r.bootloaderEvidence).toEqual([]);
  expect(r.verifiedBootState).toBe('unknown');
  expect(r.oemUnlockAllowed).toBeNull();
  expect(r.rooted).toBe(false);
  expect(r.rootedEvidence).toEqual([]);
  expect(r.integrity).toBe('Unknown');
  expect(integrityTone(r.integrity)).toBeUndefined();
  expect(bootloaderLabel(r.bootloader)).toBe('Unknown');
  expect(bootloaderTone(r.bootloader)).toBeUndefined();
  expect(r.props).toEqual({});
});

test('conflicting unlock indicators fall back to unknown, keeping evidence', () => {
  const r = analyzeScan({
    getprop: { 'ro.boot.flash.locked': '1', 'ro.boot.vbmeta.device_state': 'unlocked' },
    suPath: null,
    rootPackages: [],
  });
  expect(r.bootloader).toBe('unknown');
  expect(r.bootloaderEvidence).toContain(
    'CONFLICT: ro.boot.flash.locked vs ro.boot.vbmeta.device_state',
  );
});

test('locked device: bootloader locked, integrity not claimed', () => {
  const r = analyzeScan({
    getprop: {
      'ro.boot.flash.locked': '1',
      'ro.boot.vbmeta.device_state': 'locked',
      'ro.boot.verifiedbootstate': 'green',
      'sys.oem_unlock_allowed': '0',
    },
    suPath: null,
    rootPackages: [],
  });
  expect(r.bootloader).toBe('locked');
  expect(bootloaderLabel(r.bootloader)).toBe('Locked');
  expect(bootloaderTone(r.bootloader)).toBe('good');
  expect(r.verifiedBootState).toBe('green');
  expect(r.oemUnlockAllowed).toBe(false);
  expect(r.rooted).toBe(false);
  expect(r.integrity).toBe('Unknown');
});

test('parseGetprop: format, CR tolerance, empty values, skipped garbage', () => {
  const m = parseGetprop('[ro.product.model]: [Pixel 5]\r\n[empty]: []\ngarbage line\n');
  expect(m['ro.product.model']).toBe('Pixel 5');
  expect(m['empty']).toBe('');
  expect(Object.keys(m)).toHaveLength(2);
});
