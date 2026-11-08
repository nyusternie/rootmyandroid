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

// Parse a multi-SKU download-folder value into labeled { label, folder }
// mirror entries. Observed upstream formats (twrp.me, fetched 2026-11-08):
//   - alternating label/folder segments:
//     'ROG Phone 5|I005D|ROG Phone 5S|I005DS'
//     'Normal (recommended)|hammerhead|hammerheadcaf (use only if ...)|hammerheadcaf'
//     (labels may carry HTML entities and a trailing colon:
//     'Americas, Korea &amp; Europe (SM-N9005/hltexx, ...):|hlte|...')
//   - folder names doubled as their own labels:
//     'm7cdtu|m7cdtu|m7cdug|m7cdug|m7cdwg|m7cdwg'
//   - exactly two bare folders with no labels: 'a51cml|tuhl'
//   - exactly one labeled variant: 'International & Americas (...)|jflte'
// Returns [] when the value is not a usable set of mirrors (odd segment
// count, empty label, unsafe folder segment) — the caller then emits no
// download data for the device rather than guessing at the right folder.
export function parseDownloadVariants(value) {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return []
  const parts = raw.split('|').map((p) => p.trim())
  if (parts.length === 2) {
    const [first, second] = parts
    // Two bare folders, no labels: 'a51cml|tuhl'.
    if (isDownloadFolder(first) && isDownloadFolder(second)) {
      return parts.map((folder) => ({ label: folder, folder }))
    }
    // One labeled variant: 'International & Americas (...)|jflte'.
    if (!isDownloadFolder(first) && isDownloadFolder(second)) {
      const label = decodeEntities(first).replace(/:+$/, '').trim()
      return label ? [{ label, folder: second }] : []
    }
    return []
  }
  if (parts.length % 2 !== 0) return []
  const variants = []
  const seen = new Set()
  for (let i = 0; i < parts.length; i += 2) {
    const label = decodeEntities(parts[i]).replace(/:+$/, '').trim()
    const folder = parts[i + 1]
    if (!label || !isDownloadFolder(folder)) return []
    if (seen.has(folder)) continue
    seen.add(folder)
    variants.push({ label, folder })
  }
  return variants
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

// Display translation for support statuses (owner ruling 2026-11-08:
// /device is a GENERAL devices catalog, not a TWRP page — the template and
// the .md alternates render recovery-agnostic copy). The catalog data names
// the best-known custom recovery in one of its status values; translate that
// one for display, pass everything else through verbatim.
export function deviceStatusLabel(value) {
  const raw = String(value ?? '')
  return raw === 'No official TWRP build listed' ? 'none listed' : raw
}

// The import keeps only devices whose official support status is exactly
// 'Current' (case-insensitive). Near-miss statuses seen in the source data
// ('Current-ish', 'Unified', 'Currently Supported via IsoRec') do NOT
// qualify — the /device catalog must never overstate support (AGENTS.md
// rule 3).
export function isCurrentStatus(value) {
  return String(value ?? '').trim().toLowerCase() === 'current'
}
