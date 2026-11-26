// src/lib/app-markdown.test.js — the /app/<package>.md twin must carry every
// fact the HTML page renders (facts only, no marketing).
import { describe, expect, it } from 'vitest'
import { buildAppMarkdown } from './app-markdown.js'

const app = {
  id: 'com.example.app',
  body: 'First paragraph.\n\nSecond paragraph.',
  data: {
    name: 'Example',
    summary: 'An example app.',
    developer: 'Example Project',
    category: 'UtilitiesApplication',
    official: 'https://example.com/',
    source: 'https://f-droid.org/packages/com.example.app/',
    license: 'GPL-3.0',
    system: false,
    profile: '/Example',
    related: [{ href: '/rooting', label: 'Rooting basics' }],
    checked: '2026-11-26',
  },
}

describe('buildAppMarkdown', () => {
  it('states the package, developer and official source', () => {
    const md = buildAppMarkdown(app)
    expect(md).toContain('# Example (com.example.app)')
    expect(md).toContain('Package name: com.example.app')
    expect(md).toContain('Developer: Example Project')
    expect(md).toContain('Official: https://example.com/')
    expect(md).toContain('Source: https://rootmyandroid.com/app/com.example.app/')
  })

  it('appends the page copy verbatim so HTML and Markdown cannot drift', () => {
    const md = buildAppMarkdown(app)
    expect(md).toContain('First paragraph.')
    expect(md).toContain('Second paragraph.')
  })

  it('omits optional lines that have no fact behind them', () => {
    const bare = {
      ...app,
      body: '',
      data: { ...app.data, source: undefined, license: undefined, profile: undefined, related: [] },
    }
    const md = buildAppMarkdown(bare)
    expect(md).not.toContain('Distributed from:')
    expect(md).not.toContain('License:')
    expect(md).not.toContain('Profile page:')
    expect(md).not.toContain('Related:')
    expect(md).toContain('Normally a system app: no')
  })
})
