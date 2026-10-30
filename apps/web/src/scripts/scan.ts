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

type Row = [string, string]

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string
  )
}

function renderRows(el: HTMLElement, rows: Row[]): void {
  el.innerHTML = rows
    .map(
      ([k, v]) =>
        `<div class="kv"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>`
    )
    .join('')
}

function show(el: HTMLElement, msg: string): void {
  el.textContent = msg
  el.hidden = !msg
}

function progress(msg: string): void {
  const li = document.createElement('li')
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
  renderRows($('report-device'), [
    ['Brand', report.brand],
    ['Manufacturer', report.manufacturer],
    ['Model', report.model],
    ['Codename', report.codename],
    ['Hardware', report.hardware],
    ['CPU ABI', report.abi],
  ])

  renderRows($('report-build'), [
    ['Android version', report.androidRelease],
    ['SDK level', report.sdk === null ? 'unknown' : String(report.sdk)],
    [
      'Security patch',
      report.securityPatch === null
        ? 'unknown'
        : report.patchAgeDays === null
          ? report.securityPatch
          : `${report.securityPatch} (${report.patchAgeDays} days old)`,
    ],
    ['Build fingerprint', report.fingerprint],
    ['Build tags', report.buildTags],
  ])

  const bootRows: Row[] = [['Bootloader', report.bootloader.state]]
  if (report.bootloader.evidence.length > 0) {
    bootRows.push(['Evidence', report.bootloader.evidence.join(' · ')])
  }
  bootRows.push([
    'OEM-unlocking toggle',
    report.oemUnlockAllowed === null ? 'unknown' : report.oemUnlockAllowed ? 'allowed' : 'not allowed',
  ])
  bootRows.push(['Verified-boot state', report.verifiedBootState])
  renderRows($('report-boot'), bootRows)

  renderRows($('report-root'), [
    ['su binary on PATH', report.rootIndicators.suPresent ? 'FOUND' : 'not found'],
    [
      'Known root apps',
      report.rootIndicators.rootPackages.length > 0
        ? report.rootIndicators.rootPackages.join(', ')
        : 'none found',
    ],
    ['Caveat', 'Heuristic only — absence does not prove the device is unrooted.'],
  ])

  $('report-next').innerHTML = report.nextSteps
    .map((s) => `<div><a class="btn" href="${escapeHtml(s.href)}">${escapeHtml(s.label)}</a></div>`)
    .join('')

  reportBox.hidden = false
  reportBox.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
