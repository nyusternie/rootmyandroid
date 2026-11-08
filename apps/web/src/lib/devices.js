// src/lib/devices.js — pure helpers for the /device catalog (imported by
// tools/import-twrp-devices.mjs and pinned by src/lib/devices.test.js).
// No I/O, no imports — every function is deterministic so the device import
// is reproducible in CI.

// Turn a raw device codename into a URL-safe slug base: lowercase, split on
// every run of non-alphanumerics, join with single dashes. Multi-codename
// strings ('cheeseburger/dumpling', 'X00T, X00TD', 'instantnoodle &
// instantnoodlep') become dashed compounds. Returns '' when the input has no
// alphanumeric characters at all (caller must reject — a page needs a slug).
export function slugify(value) {
  const parts = String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return parts.join('-')
}

// Allocate one unique slug per device. Devices must be pre-sorted (the
// importer sorts by oem, then title, case-insensitive) so the winner of each
// base slug is deterministic: the FIRST device keeps the bare codename slug,
// later devices with the same base get `<base>-<oem-slug>`, and if that is
// also taken `<base>-<oem-slug>-2`, `-3`, … Returns a Map(device -> slug).
// Throws on any device whose codename slugifies to '' — do not silently
// invent a slug for it.
export function allocateSlugs(devices) {
  const taken = new Set()
  const out = new Map()
  for (const device of devices) {
    const base = slugify(device.codename)
    if (!base) {
      throw new Error(`codename ${JSON.stringify(device.codename)} produces an empty slug`)
    }
    let slug = base
    if (taken.has(slug)) {
      slug = `${base}-${slugify(device.oem)}`
    }
    let n = 2
    while (taken.has(slug)) {
      slug = `${base}-${slugify(device.oem)}-${n}`
      n += 1
    }
    taken.add(slug)
    out.set(device, slug)
  }
  return out
}

// A download folder is only linkable when it is a single URL path segment on
// the official mirror host (dl.twrp.me/<folder>). Source data sometimes
// carries pipe-joined multi-variant strings (one folder per SKU) or prose —
// those are NOT a single canonical folder, so no download link is emitted
// for the device (the importer logs them).
export function isDownloadFolder(value) {
  return /^[A-Za-z0-9._-]+$/.test(String(value ?? ''))
}

// Parse the maintainer field into a clean list: comma-separated, trimmed,
// placeholders dropped ('None', 'N/A', '?', '-', empty). Returns [] when the
// device has no listed maintainer.
export function cleanMaintainers(value) {
  const placeholders = new Set(['', 'none', 'n/a', '?', '-'])
  return String(value ?? '')
    .split(',')
    .map((name) => decodeEntities(name.trim()))
    .filter((name) => !placeholders.has(name.toLowerCase()))
}

// Decode the five standard HTML entities that appear in source data (e.g.
// '&amp;' in device titles). Harmless when absent.
export function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

// The import keeps only devices whose official support status is exactly
// 'Current' (case-insensitive). Near-miss statuses seen in the source data
// ('Current-ish', 'Unified', 'Currently Supported via IsoRec') do NOT
// qualify — the /device catalog must never overstate support (AGENTS.md
// rule 3).
export function isCurrentStatus(value) {
  return String(value ?? '').trim().toLowerCase() === 'current'
}
