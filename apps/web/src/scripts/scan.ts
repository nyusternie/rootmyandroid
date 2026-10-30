// src/scripts/scan.ts — /scan page logic (framework-free).
// Connects to a PHYSICAL Android device over USB — ADB via WebUSB, 100%
// client-side: the browser IS the ADB host (HANDOFF.md §10.2). Collects
// READ-ONLY facts only (getprop dump, package list, su presence check —
// never writes, never flashes, never executes su; HANDOFF §10.4 and
// AGENTS.md rule 6 apply unconditionally), analyzes them with the pure core
// in src/lib/scan-report.ts, and renders the report on the page.
// Nothing is transmitted (HANDOFF §10.6) — the only network calls are the
// standard first-party analytics beacons (analytics.ts).
//
// Library API surface verified against the installed type definitions:
//   @yume-chan/adb 2.6.4, @yume-chan/adb-daemon-webusb 2.3.2,
//   @yume-chan/adb-credential-web 2.1.0 (node_modules/@yume-chan/*/esm/*.d.ts).
import { Adb, AdbDaemonTransport } from '@yume-chan/adb'
import {
  AdbDaemonWebUsbDevice,
  AdbDaemonWebUsbDeviceManager,
} from '@yume-chan/adb-daemon-webusb'
import AdbWebCredentialStore from '@yume-chan/adb-credential-web'
import { analyzeDevice, parseGetprop, parsePmListPackages } from '../lib/scan-report'
import type { RawDeviceFacts, ScanReport } from '../lib/scan-report'

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing element #${id}`)
  return el
}

const connectPanel = $('connect-panel')
const connectBtn = $('connect-btn') as HTMLButtonElement
const noWebusb = $('no-webusb')
const statusPanel = $('status')
const progressList = $('progress')
const errorBox = $('error')
const reportBox = $('report')

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string
  )
}

// ---- dashboard rendering -----------------------------------------------------
// Every dynamic value passes through escapeHtml. Colors only visualize states
// the report already computed (bootloader state, verified-boot color name,
// patch age) — no new device claims are introduced here.

type Tone = 'ok' | 'info' | 'warn' | 'danger' | 'dim'

// Full class strings (never interpolated fragments) so the Tailwind scanner
// sees every utility literally in this file.
const TONE_TILE_BORDER: Record<Tone, string> = {
  ok: 'border-t-ok',
  info: 'border-t-accent',
  warn: 'border-t-warn',
  danger: 'border-t-danger',
  dim: 'border-t-faint',
}
const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-ok shadow-[0_0_6px_var(--color-ok)]',
  info: 'bg-accent shadow-[0_0_6px_var(--color-accent)]',
  warn: 'bg-warn shadow-[0_0_6px_var(--color-warn)]',
  danger: 'bg-danger shadow-[0_0_6px_var(--color-danger)]',
  dim: 'bg-faint',
}
const TONE_STROKE: Record<Tone, string> = {
  ok: 'stroke-ok',
  info: 'stroke-accent',
  warn: 'stroke-warn',
  danger: 'stroke-danger',
  dim: 'stroke-faint',
}
const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  info: 'text-accent',
  warn: 'text-warn',
  danger: 'text-danger',
  dim: 'text-ink',
}

function chip(v: string): string {
  return `<span class="rounded-full border border-line bg-inset px-[0.65rem] py-[0.2rem] font-mono text-[0.78rem] text-dim">${escapeHtml(v)}</span>`
}

// Semicircle gauge geometry: viewBox 200x120, center (100,100), r=80 — the
// arc length of the half-circle is π·80 ≈ 251.33.
const GAUGE_LEN = Math.PI * 80

function gaugeTick(days: number): string {
  const a = (Math.min(days, 365) / 365) * Math.PI
  const x1 = 100 - 74 * Math.cos(a)
  const y1 = 100 - 74 * Math.sin(a)
  const x2 = 100 - 66 * Math.cos(a)
  const y2 = 100 - 66 * Math.sin(a)
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`
}

// Meter color thresholds are a DISPLAY heuristic only (labeled as such in the
// rendered caption) — not a security audit.
function patchTone(ageDays: number | null): Tone {
  if (ageDays === null) return 'dim'
  if (ageDays < 90) return 'ok'
  if (ageDays <= 180) return 'warn'
  return 'danger'
}

function renderGauge(report: ScanReport): string {
  const age = report.patchAgeDays
  const tone = patchTone(age)
  const frac = age === null ? 0 : Math.min(age / 365, 1)
  const center =
    age === null
      ? `<div class="text-[2.2rem] font-bold leading-none">?</div><div class="mt-[0.25rem] text-[0.72rem] uppercase tracking-[0.06em] text-faint">patch age unknown</div>`
      : `<div class="text-[2.2rem] font-bold leading-none" data-countup="${age}">${age}</div><div class="mt-[0.25rem] text-[0.72rem] uppercase tracking-[0.06em] text-faint">days since patch</div>`
  const dateLine =
    report.securityPatch === null
      ? 'security patch: unknown'
      : `patch: ${report.securityPatch}`
  return `<div class="text-center">
    <div class="relative mx-auto max-w-[240px]">
      <svg viewBox="0 0 200 120" role="img" aria-label="Security patch age gauge" class="block w-full">
        <path class="fill-none stroke-inset" stroke-width="12" stroke-linecap="round" d="M 20 100 A 80 80 0 0 1 180 100" />
        <path class="fill-none ${TONE_STROKE[tone]} transition-[stroke-dasharray] duration-[900ms] ease-in-out motion-reduce:transition-none" stroke-width="12" stroke-linecap="round" d="M 20 100 A 80 80 0 0 1 180 100" style="stroke-dasharray: 0 ${GAUGE_LEN.toFixed(2)}" data-target="${(frac * GAUGE_LEN).toFixed(2)}" />
        <g class="stroke-line" stroke-width="2">${[0, 90, 180, 270, 365].map(gaugeTick).join('')}</g>
      </svg>
      <div class="pointer-events-none absolute inset-x-0 bottom-[0.35rem]">${center}</div>
    </div>
    <div class="mx-auto mt-[0.15rem] flex max-w-[240px] justify-between font-mono text-[0.85rem] text-faint"><span>0d</span><span>365d</span></div>
    <div class="mt-[0.35rem] text-[0.85rem] text-faint">${escapeHtml(dateLine)}</div>
  </div>`
}

// AOSP verified-boot state names ARE colors (green/orange/yellow/red) — map
// each name to its same-named tone; anything else stays neutral.
function verifiedBootTone(state: string): Tone {
  switch (state) {
    case 'green':
      return 'ok'
    case 'orange':
    case 'yellow':
      return 'warn'
    case 'red':
      return 'danger'
    default:
      return 'dim'
  }
}

function tile(tone: Tone, label: string, state: string, caption: string): string {
  return `<div class="rounded-[0.65rem] border border-line border-t-[3px] ${TONE_TILE_BORDER[tone]} bg-inset px-[1rem] py-[0.9rem]">
    <div class="flex items-center gap-[0.45rem]"><span class="h-[8px] w-[8px] rounded-full ${TONE_DOT[tone]} animate-pulse-dot motion-reduce:animate-none"></span><span class="text-[0.72rem] uppercase tracking-[0.06em] text-faint">${escapeHtml(label)}</span></div>
    <div class="mt-[0.4rem] text-[1.35rem] font-bold capitalize ${TONE_TEXT[tone]}">${escapeHtml(state)}</div>
    <div class="mt-[0.3rem] text-[0.85rem] text-faint">${caption}</div>
  </div>`
}

function show(el: HTMLElement, msg: string): void {
  el.textContent = msg
  el.hidden = !msg
}

function progress(msg: string): void {
  const li = document.createElement('li')
  li.className =
    "relative pl-[1.4rem] animate-scan-in motion-reduce:animate-none before:absolute before:left-0 before:font-bold before:text-ok before:content-['✓']"
  li.textContent = msg
  progressList.appendChild(li)
}

// Run a READ-ONLY shell command and return stdout as text. Prefers the shell
// protocol (separate stdout/stderr + exit code); falls back to the legacy
// protocol (mixed output) on devices without shell v2 support. (API surface
// verified against @yume-chan/adb 2.6.4: AdbSubprocessService.shellProtocol
// is `undefined` when the device lacks the shell_v2 feature.)
async function runShellText(adb: Adb, command: string): Promise<string> {
  const shell = adb.subprocess.shellProtocol
  if (shell) {
    const r = await shell.spawnWaitText(command)
    return r.stdout
  }
  return adb.subprocess.noneProtocol.spawnWaitText(command)
}

// READ-ONLY collection (HANDOFF §10.4). Each step surfaces in the progress
// list as it resolves (§10.5.4).
async function collectFacts(adb: Adb): Promise<RawDeviceFacts> {
  progress('Reading system properties (getprop)…')
  const getpropText = await runShellText(adb, 'getprop')

  progress('Listing installed packages (pm list packages — read-only)…')
  const pmText = await runShellText(adb, 'pm list packages')

  progress('Checking for an su binary (command -v su — su is never executed)…')
  const suText = await runShellText(adb, 'command -v su')

  return {
    getprop: parseGetprop(getpropText),
    pmListPackages: parsePmListPackages(pmText),
    suPath: suText.trim() || null,
  }
}

function renderReport(report: ScanReport): void {
  // --- Device hero ------------------------------------------------------------
  const heroChips = [report.codename, report.hardware, report.abi]
    .filter((v) => v !== 'unknown')
    .map(chip)
    .join('')
  $('report-device').innerHTML = `<div class="flex items-center justify-between gap-[1rem]">
    <div>
      <div class="text-[1.8rem] font-bold capitalize tracking-[-0.01em]">${escapeHtml(report.brand)} ${escapeHtml(report.model)}</div>
      <div class="mt-[0.15rem] text-[0.85rem] capitalize text-faint">${escapeHtml(report.manufacturer)}</div>
      <div class="mt-[0.7rem] flex flex-wrap gap-[0.4rem]">${heroChips}</div>
    </div>
    <svg viewBox="0 0 48 80" aria-hidden="true" class="h-[120px] w-[72px] flex-none fill-inset stroke-faint stroke-2">
      <rect x="6" y="4" width="36" height="72" rx="8" />
      <line x1="18" y1="10" x2="30" y2="10" stroke-linecap="round" />
      <line x1="14" y1="68" x2="34" y2="68" stroke-linecap="round" />
    </svg>
  </div>`

  // --- Build: patch-age gauge + version stats ---------------------------------
  $('report-build').innerHTML = `<div class="grid grid-cols-1 items-center gap-[1.25rem] min-[640px]:grid-cols-[240px_1fr]">
    ${renderGauge(report)}
    <div class="grid grid-cols-2 gap-[0.9rem]">
      <div class="rounded-[0.65rem] border border-line bg-inset px-[1rem] py-[0.9rem] transition-colors hover:border-faint"><div class="text-[1.9rem] font-bold">${escapeHtml(report.androidRelease)}</div><div class="text-[0.72rem] uppercase tracking-[0.06em] text-faint">Android</div></div>
      <div class="rounded-[0.65rem] border border-line bg-inset px-[1rem] py-[0.9rem] transition-colors hover:border-faint"><div class="text-[1.9rem] font-bold">${report.sdk === null ? '?' : report.sdk}</div><div class="text-[0.72rem] uppercase tracking-[0.06em] text-faint">SDK level</div></div>
    </div>
  </div>
  <div class="mt-[1rem] flex flex-wrap items-baseline gap-[0.6rem] text-[0.9rem] text-dim"><span class="text-[0.75rem] uppercase tracking-[0.06em] text-faint">Build tags</span>${chip(report.buildTags)}</div>
  <div class="mt-[1rem] text-[0.75rem] uppercase tracking-[0.06em] text-faint">Build fingerprint</div>
  <div class="mt-[0.35rem] overflow-x-auto break-all rounded-[0.5rem] border border-line bg-inset px-[0.8rem] py-[0.6rem] font-mono text-[0.8rem] text-dim">${escapeHtml(report.fingerprint)}</div>
  <p class="mt-[1rem] text-[0.85rem] text-faint">Meter colors are a display heuristic (green &lt; 90 days, amber 90–180, red &gt; 180) — not a security audit.</p>`

  // --- Bootloader / verified boot: three status tiles --------------------------
  // Captions only restate what the report's next-steps logic and the detection
  // comments already imply — no new device claims.
  const bootTone: Tone =
    report.bootloader.state === 'unlocked'
      ? 'ok'
      : report.bootloader.state === 'locked'
        ? 'info'
        : 'dim'
  const bootCaption =
    report.bootloader.state === 'unlocked'
      ? 'The ROM catalog is your next step — see below.'
      : report.bootloader.state === 'locked'
        ? 'The bootloader guide below is the next step.'
        : "Couldn't be verified — reported unknown, never a guess."
  const oemLabel =
    report.oemUnlockAllowed === null
      ? 'unknown'
      : report.oemUnlockAllowed
        ? 'allowed'
        : 'not allowed'
  const evidence =
    report.bootloader.evidence.length > 0
      ? `<div class="mt-[0.9rem] overflow-x-auto break-all rounded-[0.5rem] border border-line bg-inset px-[0.8rem] py-[0.6rem] font-mono text-[0.8rem] text-faint">${escapeHtml(report.bootloader.evidence.join(' · '))}</div>`
      : ''
  $('report-boot').innerHTML = `<div class="grid grid-cols-1 gap-[0.9rem] min-[640px]:grid-cols-3">
    ${tile(bootTone, 'Bootloader', report.bootloader.state, bootCaption)}
    ${tile(verifiedBootTone(report.verifiedBootState), 'Verified boot', report.verifiedBootState, '<span class="font-mono">ro.boot.verifiedbootstate</span>')}
    ${tile(report.oemUnlockAllowed === true ? 'ok' : 'dim', 'OEM-unlocking toggle', oemLabel, 'Developer-options toggle — not the lock state.')}
  </div>${evidence}`

  // --- Root indicators (heuristic — HANDOFF §10.4) ----------------------------
  const su = report.rootIndicators.suPresent
  const apps = report.rootIndicators.rootPackages
  $('report-root').innerHTML = `<div class="grid grid-cols-1 gap-[0.9rem] min-[640px]:grid-cols-2">
    ${tile(su ? 'warn' : 'dim', 'su binary on PATH', su ? 'FOUND' : 'not found', 'Checked with <span class="font-mono">command -v</span> — su is never executed.')}
    ${tile(apps.length > 0 ? 'warn' : 'dim', 'Known root apps', String(apps.length), apps.length > 0 ? `<span class="mt-[0.4rem] flex flex-wrap gap-[0.4rem]">${apps.map(chip).join('')}</span>` : 'none found')}
  </div>
  <p class="mt-[1rem] text-[0.85rem] text-faint">Heuristic only — absence does not prove the device is unrooted.</p>`

  // First next step is the state-driven primary action — emphasize it.
  $('report-next').innerHTML = report.nextSteps
    .map(
      (s, i) =>
        `<div><a class="btn${i === 0 ? ' btn-primary' : ''}" href="${escapeHtml(s.href)}">${escapeHtml(s.label)}</a></div>`
    )
    .join('')

  reportBox.hidden = false
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Sweep the gauge arc from 0 to its target on the frame after reveal (the
  // transition is suppressed under prefers-reduced-motion by the class).
  const fill = reportBox.querySelector<SVGPathElement>('.transition-[stroke-dasharray]')
  if (fill) {
    const target = fill.dataset.target ?? '0'
    requestAnimationFrame(() => {
      fill.style.strokeDasharray = `${target} ${GAUGE_LEN.toFixed(2)}`
    })
  }
  // Count the gauge number up in sync with the arc sweep. Skipped under
  // prefers-reduced-motion — the final value is already rendered.
  const numEl = reportBox.querySelector<HTMLElement>('[data-countup]')
  if (numEl && !reducedMotion) {
    const target = Number(numEl.dataset.countup ?? '0')
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / 900, 1)
      // ease-in-out quad, matching the arc sweep's easing
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      numEl.textContent = String(Math.round(target * eased))
      if (t < 1) requestAnimationFrame(tick)
    }
    numEl.textContent = '0'
    requestAnimationFrame(tick)
  }
  reportBox.scrollIntoView({
    behavior: reducedMotion ? 'auto' : 'smooth',
    block: 'start',
  })
}

let busy = false

async function run(manager: AdbDaemonWebUsbDeviceManager): Promise<void> {
  if (busy) return
  busy = true
  connectBtn.disabled = true
  show(errorBox, '')
  reportBox.hidden = true
  progressList.textContent = ''
  statusPanel.hidden = false

  let adb: Adb | null = null
  let disconnected = false
  try {
    window.rmaEvent?.('scan_connect')

    // §10.5.2 — device picker (ADB interface filter merged in by the library;
    // default filter class 255 / subclass 66 / protocol 1 "as defined by
    // Google" per AdbDefaultInterfaceFilter in @yume-chan/adb-daemon-webusb).
    progress('Waiting for device selection…')
    const device = await manager.requestDevice()
    if (!device) {
      // Verified in the installed source (manager.js): `undefined` is
      // returned when the picker is cancelled (NotFoundError) OR when the
      // chosen device exposes no ADB interface.
      show(
        errorBox,
        'No device selected — or the selected device exposes no ADB interface. Pick your Android device in the chooser and try again.'
      )
      return
    }

    progress(`Opening USB connection to ${device.name || device.serial}…`)
    const connection = await device.connect()

    // §10.5.3 — the device shows its RSA "Allow USB debugging" prompt while
    // authenticate() runs. The credential keypair is generated in-browser
    // (WebCrypto) and stored locally (IndexedDB) by @yume-chan/adb-credential-web.
    progress('Waiting for authorization — check the device for the “Allow USB debugging” prompt and tap Allow…')
    const credentialStore = new AdbWebCredentialStore('rootmyandroid.com')
    const transport = await AdbDaemonTransport.authenticate({
      serial: device.serial,
      connection,
      credentialStore,
    })
    window.rmaEvent?.('scan_authorized')

    adb = new Adb(transport)
    // §10.5.6 — surface a mid-scan disconnect as its own error state.
    adb.disconnected.then(
      () => {
        disconnected = true
      },
      () => {}
    )

    const raw = await collectFacts(adb)
    if (disconnected) throw new Error('disconnected')

    const report = analyzeDevice(raw)
    renderReport(report)
    progress('Scan complete.')
    window.rmaEvent?.('scan_complete')
  } catch (e) {
    if (disconnected || (e instanceof Error && e.message === 'disconnected')) {
      show(errorBox, 'The device disconnected mid-scan. Reconnect it and try again.')
    } else if (e instanceof AdbDaemonWebUsbDevice.DeviceBusyError) {
      show(
        errorBox,
        'The device is busy — another browser tab or program already holds its USB interface. Close it and try again. If a local ADB server is running (adb devices), stop it with `adb kill-server` and retry.'
      )
    } else if (adb === null) {
      // Failure before/while authenticating: the RSA prompt was denied,
      // revoked, or USB debugging is off.
      show(
        errorBox,
        'Could not authorize with the device. Make sure USB debugging is enabled, tap “Allow” on the device prompt, and try again.'
      )
    } else {
      show(
        errorBox,
        `Scan failed: ${e instanceof Error ? e.message : 'unknown error'}. Reconnect the device and try again.`
      )
    }
  } finally {
    // Release the USB interface so the device (and other tabs) can use it.
    if (adb) {
      try {
        await adb.close()
      } catch {
        // best-effort cleanup only
      }
    }
    busy = false
    connectBtn.disabled = false
  }
}

// §10.5.1 — no WebUSB in this browser: static fallback panel, no connect UI.
// (AdbDaemonWebUsbDeviceManager.BROWSER is `undefined` exactly when
// navigator.usb is missing — verified in the installed manager.js source.)
const manager = AdbDaemonWebUsbDeviceManager.BROWSER
if (!manager) {
  connectPanel.hidden = true
  noWebusb.hidden = false
} else {
  connectBtn.addEventListener('click', () => void run(manager))
}
