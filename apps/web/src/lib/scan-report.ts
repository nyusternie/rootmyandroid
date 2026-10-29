// src/lib/scan-report.ts — pure parsing + detection core for the /scan page.
// No DOM, no ADB imports: every function is unit-testable in Vitest (CI has
// no USB device). Spec: HANDOFF.md §10.3/§10.4.
//
// RULE-SOURCE POLICY (AGENTS.md rule 3 — no guessing): every detection rule
// carries a SOURCE comment. As of 2026-10-29 NO real-device fixture has been
// captured (fixtures land in src/lib/fixtures/scan/ per HANDOFF §10.3), so
// all value-semantics rules are marked UNVERIFIED and must be re-checked
// against the first fixture per OEM. An absent key ALWAYS renders as
// "unknown" (HANDOFF §10.4) — that behavior is spec, not a device claim.

/** Raw, JSON-serializable facts collected from the device by scan.ts. */
export interface RawDeviceFacts {
  /** Parsed output of `getprop` (see parseGetprop). */
  getprop: Record<string, string>
  /** Package IDs from `pm list packages` (already stripped of the "package:" prefix). */
  pmListPackages?: string[]
  /** Result of `command -v su`: the resolved path, or null/empty when absent. */
  suPath?: string | null
}

export type BootloaderState = 'locked' | 'unlocked' | 'unknown'

export interface ScanReport {
  brand: string
  manufacturer: string
  model: string
  /** ro.product.device — the build codename. */
  codename: string
  hardware: string
  abi: string
  fingerprint: string
  androidRelease: string
  /** ro.build.version.sdk as an integer; null when absent/unparseable. */
  sdk: number | null
  /** ro.build.version.security_patch (YYYY-MM-DD); null when absent. */
  securityPatch: string | null
  /** Whole days between securityPatch and `now`; null when patch unknown. */
  patchAgeDays: number | null
  buildTags: string
  bootloader: { state: BootloaderState; evidence: string[] }
  /** sys.oem_unlock_allowed — the OEM-unlocking TOGGLE, NOT the lock state. */
  oemUnlockAllowed: boolean | null
  /** Raw ro.boot.verifiedbootstate value, or 'unknown' when absent. */
  verifiedBootState: string
  rootIndicators: { heuristic: true; suPresent: boolean; rootPackages: string[] }
  findings: string[]
  nextSteps: { label: string; href: string }[]
}

const UNKNOWN = 'unknown'

// Known root-app package IDs. Heuristic ONLY — an installed app does not
// prove an active su daemon; HANDOFF §10.4 requires the UI to label this
// heuristic. SOURCE: package ID named in HANDOFF.md §10.4 (2026-10-27);
// not yet fixture-verified.
const KNOWN_ROOT_PACKAGES: readonly string[] = ['com.topjohnwu.magisk']

// next_steps may link ONLY to content that exists in this repo
// (HANDOFF §10.4: "No invented device claims"). Verified on disk 2026-10-29:
//   src/content/guides/check-bootloader-status.md
//   src/content/guides/what-is-rooting.md
//   src/pages/roms/ + src/content/roms/{crdroid,e-os,grapheneos,lineageos}.md
const GUIDE_BOOTLOADER = '/guides/check-bootloader-status'
const GUIDE_ROOTING = '/guides/what-is-rooting'
const ROM_CATALOG = '/roms'

/**
 * Parse `adb shell getprop` output into a key→value map.
 * Line format: `[ro.product.brand]: [google]`.
 * SOURCE for the format: toybox getprop prints "[%s]: [%s]" — UNVERIFIED
 * against a captured fixture in this repo (2026-10-29); re-check when the
 * first fixture lands. Non-matching lines are skipped; a trailing \r is
 * tolerated; an empty value (`[key]: []`) maps to ''.
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
 * Parse `pm list packages` output into bare package IDs.
 * Line format: `package:com.example.app`.
 * SOURCE for the format: standard `pm list packages` output — UNVERIFIED
 * against a captured fixture in this repo (2026-10-29); re-check when the
 * first fixture lands. Lines without the `package:` prefix are skipped;
 * a trailing \r is tolerated.
 */
export function parsePmListPackages(text: string): string[] {
  const out: string[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '').trim()
    if (!line.startsWith('package:')) continue
    const id = line.slice('package:'.length).trim()
    if (id) out.push(id)
  }
  return out
}

export interface AnalyzeOptions {
  /** Reference time for patch-age math; inject in tests for determinism. */
  now?: Date
}

/** Whole days between a YYYY-MM-DD patch string and `now`; null if unusable. */
function daysSincePatch(patch: string | undefined, now: Date): number | null {
  if (!patch || !/^\d{4}-\d{2}-\d{2}$/.test(patch)) return null
  const ms = Date.parse(`${patch}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  // Clamp at 0: a patch date in the future indicates clock skew somewhere —
  // report 0 rather than a negative age.
  return Math.max(0, Math.floor((now.getTime() - ms) / 86_400_000))
}

/**
 * The rules engine: map raw device facts → ScanReport (HANDOFF §10.1 item 2).
 * Absent keys NEVER produce an assumption — they produce 'unknown'/null.
 */
export function analyzeDevice(raw: RawDeviceFacts, opts: AnalyzeOptions = {}): ScanReport {
  const now = opts.now ?? new Date()
  const p = raw.getprop
  const get = (k: string): string | undefined => {
    const v: string | undefined = p[k]
    return typeof v === 'string' && v !== '' ? v : undefined
  }
  const val = (k: string): string => get(k) ?? UNKNOWN

  // --- Bootloader / unlock state -------------------------------------------
  const evidence: string[] = []
  let state: BootloaderState = 'unknown'
  // SOURCE: UNVERIFIED (no fixture yet, 2026-10-29) — semantics per Android
  // bootloader convention: ro.boot.flash.locked "1" = locked, "0" = unlocked.
  const flashLocked = get('ro.boot.flash.locked')
  if (flashLocked === '1') {
    state = 'locked'
    evidence.push('ro.boot.flash.locked=1')
  } else if (flashLocked === '0') {
    state = 'unlocked'
    evidence.push('ro.boot.flash.locked=0')
  }
  // SOURCE: UNVERIFIED (no fixture yet, 2026-10-29) — ro.boot.vbmeta.device_state
  // carries the literal strings "locked" / "unlocked".
  const vbmeta = get('ro.boot.vbmeta.device_state')
  if (vbmeta === 'locked' || vbmeta === 'unlocked') {
    evidence.push(`ro.boot.vbmeta.device_state=${vbmeta}`)
    if (state === 'unknown') {
      state = vbmeta
    } else if (state !== vbmeta) {
      // Indicators disagree — never assume (HANDOFF §10.4): fall back to
      // "unknown" and keep both readings as evidence.
      state = 'unknown'
      evidence.push('CONFLICT: ro.boot.flash.locked vs ro.boot.vbmeta.device_state')
    }
  }

  // sys.oem_unlock_allowed: the Developer-options TOGGLE state only. It does
  // NOT indicate the current lock state — kept as a separate field for that
  // reason. SOURCE: UNVERIFIED (no fixture yet, 2026-10-29); "1"/"0".
  const oem = get('sys.oem_unlock_allowed')
  const oemUnlockAllowed = oem === '1' ? true : oem === '0' ? false : null

  // ro.boot.verifiedbootstate: reported raw. Known value set per AOSP AVB
  // (green/orange/yellow/red) — SOURCE: UNVERIFIED (no fixture yet,
  // 2026-10-29); the raw string is surfaced either way.
  const verifiedBootState = get('ro.boot.verifiedbootstate') ?? UNKNOWN

  // --- Root indicators (heuristic — HANDOFF §10.4) --------------------------
  const packages = raw.pmListPackages ?? []
  const rootPackages = packages.filter((id) => KNOWN_ROOT_PACKAGES.includes(id))
  const suPresent = typeof raw.suPath === 'string' && raw.suPath.length > 0

  // --- Build / patch ---------------------------------------------------------
  const sdkRaw = get('ro.build.version.sdk')
  const sdkParsed = sdkRaw === undefined ? Number.NaN : Number.parseInt(sdkRaw, 10)
  const sdk = Number.isNaN(sdkParsed) ? null : sdkParsed
  const securityPatch = get('ro.build.version.security_patch') ?? null
  const age = daysSincePatch(securityPatch ?? undefined, now)

  // --- Findings (human-readable; the UI renders these verbatim) --------------
  const findings: string[] = []
  findings.push(
    sdk === null
      ? `Android ${val('ro.build.version.release')} (SDK unknown)`
      : `Android ${val('ro.build.version.release')} (SDK ${sdk})`,
  )
  findings.push(
    age === null
      ? `Security patch: ${securityPatch ?? UNKNOWN}`
      : `Security patch: ${securityPatch} (${age} days old)`,
  )
  findings.push(`Bootloader: ${state}`)
  if (suPresent) findings.push('su binary found on PATH (heuristic root indicator)')
  for (const id of rootPackages) findings.push(`Root app installed: ${id} (heuristic)`)

  // --- Next steps: state-driven, links to existing content ONLY --------------
  const nextSteps: { label: string; href: string }[] = []
  if (state === 'unlocked') {
    nextSteps.push({ label: 'Browse the ROM catalog', href: ROM_CATALOG })
  } else {
    // locked OR unknown: the bootloader guide is the honest next step.
    nextSteps.push({ label: 'Check your bootloader status', href: GUIDE_BOOTLOADER })
  }
  nextSteps.push({ label: 'What is rooting?', href: GUIDE_ROOTING })

  return {
    brand: val('ro.product.brand'),
    manufacturer: val('ro.product.manufacturer'),
    model: val('ro.product.model'),
    codename: val('ro.product.device'),
    hardware: val('ro.hardware'),
    abi: val('ro.product.cpu.abi'),
    fingerprint: val('ro.build.fingerprint'),
    androidRelease: val('ro.build.version.release'),
    sdk,
    securityPatch,
    patchAgeDays: age,
    buildTags: val('ro.build.tags'),
    bootloader: { state, evidence },
    oemUnlockAllowed,
    verifiedBootState,
    rootIndicators: { heuristic: true, suPresent, rootPackages },
    findings,
    nextSteps,
  }
}
