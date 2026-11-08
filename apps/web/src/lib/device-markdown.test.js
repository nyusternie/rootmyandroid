// src/lib/device-markdown.test.js — pins the /device/<id>.md output shape of
// buildDeviceMarkdown for the three entry shapes the catalog contains:
// plain Current TWRP device, multi-SKU variant device, Google Pixel entry.
import { describe, expect, it } from 'vitest'
import { buildDeviceMarkdown } from './device-markdown.js'

const base = {
  id: 'marlin',
  data: {
    title: 'Google Pixel XL',
    oem: 'Google',
    codename: 'marlin',
    supportstatus: 'Current',
    maintainer: ['Dees_Troy'],
    devicetree: 'https://github.com/TeamWin/android_device_google_marlin',
    downloadfolder: 'marlin',
    variants: undefined,
    factoryimages: undefined,
    notes: undefined,
    updated: new Date('2026-11-08T00:00:00Z'),
  },
}

describe('buildDeviceMarkdown', () => {
  it('renders a plain Current TWRP device byte-exactly', () => {
    expect(buildDeviceMarkdown(base)).toBe(
      [
        '# Google Pixel XL',
        '',
        '> Device facts and download links for the Google Pixel XL (codename marlin).',
        '',
        'Source: https://rootmyandroid.com/device/marlin/',
        'Brand: Google',
        'Codename: marlin',
        'Recovery support status: Current',
        'Maintainer: Dees_Troy',
        'Device tree: https://github.com/TeamWin/android_device_google_marlin',
        'Recovery download (Americas): https://dl.twrp.me/marlin/',
        'Recovery download (Europe): https://eu.dl.twrp.me/marlin/',
        'Listed: 2026-11-08',
        '',
      ].join('\n'),
    )
  })

  it('renders a multi-SKU variant device', () => {
    const hammerhead = {
      id: 'hammerhead',
      data: {
        ...base.data,
        title: 'LG Nexus 5',
        oem: 'LG',
        codename: 'hammerhead',
        maintainer: [],
        devicetree: undefined,
        downloadfolder: undefined,
        variants: [
          { label: 'Normal (recommended)', folder: 'hammerhead' },
          { label: 'hammerheadcaf (use only if you know this is what you need)', folder: 'hammerheadcaf' },
        ],
      },
    }
    const md = buildDeviceMarkdown(hammerhead)
    expect(md).toContain('Recovery variants:')
    expect(md).toContain(
      '- Normal (recommended) (hammerhead): https://dl.twrp.me/hammerhead/ | https://eu.dl.twrp.me/hammerhead/',
    )
    expect(md).toContain(
      '- hammerheadcaf (use only if you know this is what you need) (hammerheadcaf): https://dl.twrp.me/hammerheadcaf/ | https://eu.dl.twrp.me/hammerheadcaf/',
    )
    expect(md).not.toContain('Maintainer:')
    expect(md).not.toContain('Device tree:')
    expect(md).not.toContain('Recovery download (Americas):')
  })

  it('renders a Google Pixel entry with factory images and notes', () => {
    const tokay = {
      id: 'tokay',
      data: {
        ...base.data,
        title: 'Google Pixel 9',
        codename: 'tokay',
        supportstatus: 'No official TWRP build listed',
        maintainer: [],
        devicetree: undefined,
        downloadfolder: undefined,
        factoryimages: 'https://developers.google.com/android/images',
        notes: 'Some cautionary note.',
      },
    }
    const md = buildDeviceMarkdown(tokay)
    expect(md).toContain('Recovery support status: none listed')
    expect(md).toContain('Factory images: https://developers.google.com/android/images')
    expect(md).toContain('Notes: Some cautionary note.')
    expect(md).not.toContain('Recovery download')
    expect(md).not.toContain('Recovery variants:')
  })
})
