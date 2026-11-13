// apps/android/scan.ts — pure parsing + detection core for the Device scan
// tab. Port of apps/web/src/lib/scan-report.ts (same rules, same SOURCE
// policy: every rule carries a source; absent values render "unknown" —
// never a guess). No React, no NativeModules: every function is
// fixture-testable in jest (CI has no USB device).
//
// First CONFIRMING fixture: __tests__/fixtures/scan/redfin-2026-11-13.json
// (Google Pixel 5, Android 14, captured over USB adb 2026-11-13) — confirms
// ro.boot.flash.locked=0 + ro.boot.vbmeta.device_state="unlocked" on a
// device with a known-unlocked bootloader, and ro.boot.verifiedbootstate
// "orange" (AOSP AVB's unlocked color).

/** Raw, JSON-serializable facts collected from the device by ScanModule. */
export interface RawScanFacts {
  /** Parsed output of `getprop` (see parseGetprop). */
  getprop: Record<string, string>
  /** Resolved `command -v su` path, or null when absent. */
  suPath: string | null
  /** Known root-app package IDs present in PackageManager (heuristic). */
  rootPackages: string[]
}

export type BootloaderState = 'locked' | 'unlocked' | 'unknown'

// Known root-app package IDs. Heuristic ONLY — an installed app does not
// prove an active su daemon; the UI labels this heuristic. SOURCE: package
// ID named in HANDOFF.md §10.4 (2026-10-27); Magisk presence CONFIRMED on
// redfin 2026-11-13 (fixture — installed + su at /product/bin/su).
export const KNOWN_ROOT_PACKAGES: readonly string[] = ['com.topjohnwu.magisk']

export interface ScanResult {
  model: string
  android: string
  build: string
  bootloader: BootloaderState
  bootloaderEvidence: string[]
  verifiedBootState: string
  /** sys.oem_unlock_allowed — the OEM-unlocking TOGGLE, NOT the lock state. */
  oemUnlockAllowed: boolean | null
  rooted: boolean
  rootedEvidence: string[]
  integrity: string
}

/**
 * Parse `getprop` output into a key→value map.
 * Line format: `[ro.product.brand]: [google]`.
 * SOURCE for the format: toybox getprop prints "[%s]: [%s]" — CONFIRMED
 * against the redfin fixture (2026-11-13, captured from the live device).
 * Non-matching lines are skipped; a trailing \r is tolerated; an empty
 * value (`[key]: []`) maps to ''.
 */
export function parseGetprop(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    const m = /^\[([^\]]+)\]: \[(.*)\]$/.exec(line)
    if (m) out[m[1]] = m[2]
  }
  return out
}

/**
 * The rules engine: raw device facts → ScanResult. Ported 1:1 from
 * apps/web/src/lib/scan-report.ts analyzeDevice() — that file carries the
 * full SOURCE comments per rule. Absent keys NEVER produce an assumption —
 * they produce 'unknown'.
 */
export function analyzeScan(raw: RawScanFacts): ScanResult {
  const p = raw.getprop
  const get = (k: string): string | undefined => {
    const v: string | undefined = p[k]
    return typeof v === 'string' && v !== '' ? v : undefined
  }
  const val = (k: string): string => get(k) ?? 'unknown'

  // --- Bootloader / unlock state -------------------------------------------
  const evidence: string[] = []
  let state: BootloaderState = 'unknown'
  // SOURCE: CONFIRMED on redfin 2026-11-13 (fixture: flash.locked=0 on a
  // device with a known-unlocked bootloader) — ro.boot.flash.locked
  // "1" = locked, "0" = unlocked.
  const flashLocked = get('ro.boot.flash.locked')
  if (flashLocked === '1') {
    state = 'locked'
    evidence.push('ro.boot.flash.locked=1')
  } else if (flashLocked === '0') {
    state = 'unlocked'
    evidence.push('ro.boot.flash.locked=0')
  }
  // SOURCE: CONFIRMED on redfin 2026-11-13 (fixture: the literal string
  // "unlocked" observed) — ro.boot.vbmeta.device_state carries the literal
  // strings "locked" / "unlocked".
  const vbmeta = get('ro.boot.vbmeta.device_state')
  if (vbmeta === 'locked' || vbmeta === 'unlocked') {
    evidence.push(`ro.boot.vbmeta.device_state=${vbmeta}`)
    if (state === 'unknown') {
      state = vbmeta
    } else if (state !== vbmeta) {
      // Indicators disagree — never assume: fall back to "unknown" and
      // keep both readings as evidence.
      state = 'unknown'
      evidence.push('CONFLICT: ro.boot.flash.locked vs ro.boot.vbmeta.device_state')
    }
  }

  // sys.oem_unlock_allowed: the Developer-options TOGGLE state only. It does
  // NOT indicate the current lock state — kept as a separate field for that
  // reason. SOURCE: "1"/"0"; value 1 observed on redfin 2026-11-13 (fixture).
  const oem = get('sys.oem_unlock_allowed')
  const oemUnlockAllowed = oem === '1' ? true : oem === '0' ? false : null

  // ro.boot.verifiedbootstate: reported raw. Known value set per AOSP AVB
  // (green/orange/yellow/red) — "orange" observed on redfin 2026-11-13
  // (fixture, unlocked bootloader); the raw string is surfaced either way.
  const verifiedBootState = get('ro.boot.verifiedbootstate') ?? 'unknown'

  // --- Root indicators (heuristic — same as the web /scan) ------------------
  const suPresent = typeof raw.suPath === 'string' && raw.suPath.length > 0
  const rootedEvidence: string[] = []
  if (suPresent) rootedEvidence.push(`su binary on PATH: ${raw.suPath} (heuristic root indicator)`)
  for (const id of raw.rootPackages) rootedEvidence.push(`Root app installed: ${id} (heuristic)`)

  // --- Build fields ----------------------------------------------------------
  const model = `${val('ro.product.model')} (${val('ro.product.device')})`
  const sdkRaw = get('ro.build.version.sdk')
  const sdkParsed = sdkRaw === undefined ? Number.NaN : Number.parseInt(sdkRaw, 10)
  const sdk = Number.isNaN(sdkParsed) ? null : sdkParsed
  const android =
    sdk === null ? `${val('ro.build.version.release')} (SDK unknown)` : `${val('ro.build.version.release')} (SDK ${sdk})`
  const build = get('ro.build.display.id') ?? val('ro.build.fingerprint')

  // --- Integrity -------------------------------------------------------------
  // Derived locally from the bootloader state ONLY. The real Play Integrity
  // verdict needs Google's server-side API and is NOT computable on-device —
  // this row never claims more than that derivation.
  const integrity = state === 'unlocked' ? 'Failing (unlocked bootloader)' : 'Unknown'

  return {
    model,
    android,
    build,
    bootloader: state,
    bootloaderEvidence: evidence,
    verifiedBootState,
    oemUnlockAllowed,
    rooted: suPresent || raw.rootPackages.length > 0,
    rootedEvidence,
    integrity,
  }
}

/** UI tone for the Bootloader row: unlocked = warn, locked = good baseline. */
export function bootloaderTone(state: BootloaderState): 'good' | 'warn' | undefined {
  return state === 'unlocked' ? 'warn' : state === 'locked' ? 'good' : undefined
}

/** UI label for the Bootloader row. */
export function bootloaderLabel(state: BootloaderState): string {
  return state === 'locked' ? 'Locked' : state === 'unlocked' ? 'Unlocked' : 'Unknown'
}

/** UI tone for the Integrity row: only the failing derivation is warn-toned. */
export function integrityTone(integrity: string): 'warn' | undefined {
  return integrity.startsWith('Failing') ? 'warn' : undefined
}
