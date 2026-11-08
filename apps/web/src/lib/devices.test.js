// src/lib/devices.test.js — pins the pure device-import helpers in
// src/lib/devices.js. Every fixture below mirrors data actually observed in
// the upstream device list (capture date 2026-11-08): uppercase codenames
// ('Z00A'), multi-codename strings ('cheeseburger/dumpling',
// 'instantnoodle & instantnoodlep'), the two real slug collisions
// ('odin' = Sony Xperia ZL vs Xiaomi Mi Mix 4; 'bardock' = BQ Aquaris X vs
// BQ Aquaris X Pro), pipe-joined download folders, and the placeholder
// maintainer 'None'.
import { describe, expect, it } from 'vitest'
import {
  allocateSlugs,
  cleanMaintainers,
  decodeEntities,
  isCurrentStatus,
  isDownloadFolder,
  slugify,
} from './devices.js'

describe('slugify', () => {
  it('passes simple lowercase codenames through unchanged', () => {
    expect(slugify('marlin')).toBe('marlin')
    expect(slugify('beyond2lte')).toBe('beyond2lte')
  })

  it('lowercases uppercase codenames', () => {
    expect(slugify('Z00A')).toBe('z00a')
    expect(slugify('ND1')).toBe('nd1')
    expect(slugify('Pacman')).toBe('pacman')
  })

  it('turns underscores and dashes into single dashes', () => {
    expect(slugify('z2_plus')).toBe('z2-plus')
    expect(slugify('ailsa_ii')).toBe('ailsa-ii')
    expect(slugify('SGH-T769')).toBe('sgh-t769')
  })

  it('compounds multi-codename strings', () => {
    expect(slugify('cheeseburger/dumpling')).toBe('cheeseburger-dumpling')
    expect(slugify('X00T, X00TD')).toBe('x00t-x00td')
    expect(slugify('instantnoodle & instantnoodlep')).toBe('instantnoodle-instantnoodlep')
    expect(slugify('Z01M/ZD552KL/Phoenix')).toBe('z01m-zd552kl-phoenix')
  })

  it('returns an empty string when there is nothing alphanumeric', () => {
    expect(slugify('!!!')).toBe('')
    expect(slugify('')).toBe('')
  })
})

describe('allocateSlugs', () => {
  // Pre-sorted input (oem, then title, case-insensitive) — the importer
  // sorts before calling, so the winner of each base slug is deterministic.
  const devices = [
    { oem: 'BQ', title: 'BQ Aquaris X (bardock)', codename: 'bardock' },
    { oem: 'BQ', title: 'BQ Aquaris X Pro (bardock)', codename: 'bardock' },
    { oem: 'Sony', title: 'Sony Xperia ZL', codename: 'odin' },
    { oem: 'Xiaomi', title: 'Xiaomi Mi Mix 4', codename: 'odin' },
    { oem: 'ZUK', title: 'ZUK Z2 Pro', codename: 'z2_row' },
  ]

  it('keeps the bare codename for the first device, suffixes later ones', () => {
    const slugs = allocateSlugs(devices)
    expect(slugs.get(devices[0])).toBe('bardock')
    expect(slugs.get(devices[1])).toBe('bardock-bq')
    expect(slugs.get(devices[2])).toBe('odin')
    expect(slugs.get(devices[3])).toBe('odin-xiaomi')
    expect(slugs.get(devices[4])).toBe('z2-row')
  })

  it('adds a numeric suffix when <base>-<oem> is also taken', () => {
    const trio = [
      { oem: 'Acme', title: 'Acme One', codename: 'foo' },
      { oem: 'Acme', title: 'Acme Two', codename: 'foo' },
      { oem: 'Acme', title: 'Acme Three', codename: 'foo' },
    ]
    const slugs = allocateSlugs(trio)
    expect(slugs.get(trio[0])).toBe('foo')
    expect(slugs.get(trio[1])).toBe('foo-acme')
    expect(slugs.get(trio[2])).toBe('foo-acme-2')
  })

  it('never emits the same slug twice and every slug is URL-safe', () => {
    const slugs = [...allocateSlugs(devices).values()]
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9][a-z0-9-]*$/)
    }
  })

  it('throws on a codename that produces an empty slug', () => {
    expect(() => allocateSlugs([{ oem: 'Acme', title: 'Acme One', codename: '!!!' }])).toThrow(
      /empty slug/
    )
  })
})

describe('isDownloadFolder', () => {
  it('accepts single path segments', () => {
    expect(isDownloadFolder('marlin')).toBe(true)
    expect(isDownloadFolder('Z01M')).toBe(true)
    expect(isDownloadFolder('bardock_pro')).toBe(true)
  })

  it('rejects pipe-joined multi-variant strings and prose', () => {
    expect(isDownloadFolder('ROG Phone 5|I005D|ROG Phone 5S|I005DS')).toBe(false)
    expect(isDownloadFolder('n8000|n8000|n8010|n8010')).toBe(false)
    expect(isDownloadFolder('Normal (recommended)|hammerhead|hammerheadcaf')).toBe(false)
    expect(isDownloadFolder('')).toBe(false)
    expect(isDownloadFolder(undefined)).toBe(false)
  })
})

describe('cleanMaintainers', () => {
  it('splits comma-separated names and trims them', () => {
    expect(cleanMaintainers('bigbiff, Dees_Troy')).toEqual(['bigbiff', 'Dees_Troy'])
    expect(cleanMaintainers('Kelsey Petterson')).toEqual(['Kelsey Petterson'])
  })

  it('drops placeholder values entirely', () => {
    expect(cleanMaintainers('None')).toEqual([])
    expect(cleanMaintainers('none')).toEqual([])
    expect(cleanMaintainers('N/A')).toEqual([])
    expect(cleanMaintainers('')).toEqual([])
    expect(cleanMaintainers(undefined)).toEqual([])
  })
})

describe('decodeEntities', () => {
  it('decodes the five standard entities', () => {
    expect(decodeEntities('International &amp; Duos')).toBe('International & Duos')
    expect(decodeEntities('a &lt;b&gt; c')).toBe('a <b> c')
  })

  it('leaves plain strings untouched', () => {
    expect(decodeEntities('Google Pixel XL')).toBe('Google Pixel XL')
  })
})

describe('isCurrentStatus', () => {
  it('accepts exactly Current, case-insensitive', () => {
    expect(isCurrentStatus('Current')).toBe(true)
    expect(isCurrentStatus('current')).toBe(true)
    expect(isCurrentStatus(' Current ')).toBe(true)
  })

  it('rejects near-miss and unsupported statuses', () => {
    expect(isCurrentStatus('Current-ish')).toBe(false)
    expect(isCurrentStatus('Unified')).toBe(false)
    expect(isCurrentStatus('Currently Supported via IsoRec')).toBe(false)
    expect(isCurrentStatus('No longer updated')).toBe(false)
    expect(isCurrentStatus('')).toBe(false)
    expect(isCurrentStatus(undefined)).toBe(false)
  })
})
