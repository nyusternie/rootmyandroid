// src/lib/ai-surfaces.test.js — pins the AI-friendly discovery surfaces:
//  1. robots.txt keeps the vendor-verified AI-crawler tokens (each Allow: /)
//  2. the generated /llms.txt lists every non-draft guide/ROM and every link
//     in it resolves to a real route (src/pages file, content entry, or an
//     allowlisted Worker-owned URL)
//  3. guide/ROM frontmatter dates stay well-formed (published <= updated)
//  4. buildGuideMarkdown (the /guides/<id>.md endpoint logic) keeps its
//     byte-exact output shape
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildGuideMarkdown } from './guide-markdown'
import { buildLlmsTxt } from './llms-txt'

const WEB = fileURLToPath(new URL('../..', import.meta.url))

// Minimal frontmatter reader — sufficient for the flat `key: value` scalars
// used by the guides and roms collections.
function frontmatter(file) {
  const raw = readFileSync(file, 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/)
  if (!m) throw new Error(`no frontmatter in ${file}`)
  const data = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z]+):\s*(.*)$/)
    if (kv) data[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1')
  }
  return data
}

function collection(name) {
  const dir = join(WEB, 'src/content', name)
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ id: f.replace(/\.md$/, ''), data: frontmatter(join(dir, f)) }))
    .filter((e) => e.data.draft !== 'true')
    .sort((a, b) => (Number(a.data.order) || 999) - (Number(b.data.order) || 999))
}

const guides = collection('guides')
const roms = collection('roms')
const devices = collection('devices')

describe('robots.txt AI-crawler policy', () => {
  const robots = readFileSync(join(WEB, 'public/robots.txt'), 'utf8')
  // Vendor-verified tokens (sources cited inline in public/robots.txt).
  const tokens = [
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Claude-User',
    'Claude-SearchBot',
    'PerplexityBot',
    'Perplexity-User',
    'Applebot-Extended',
    'Meta-ExternalAgent',
    'Meta-ExternalFetcher',
    'Amazonbot',
    'CCBot',
  ]
  for (const token of tokens) {
    it(`allows ${token}`, () => {
      expect(robots).toMatch(new RegExp(`User-agent: ${token}\nAllow: /`))
    })
  }
  it('keeps the wildcard allow and the sitemap reference', () => {
    expect(robots).toMatch(/User-agent: \*\nAllow: \//)
    expect(robots).toMatch(/Sitemap: https:\/\/rootmyandroid\.com\/sitemap-index\.xml/)
  })
  it('points crawlers at /agents and /llms.txt', () => {
    expect(robots).toContain('https://rootmyandroid.com/agents')
    expect(robots).toContain('https://rootmyandroid.com/llms.txt')
  })
})

describe('generated /llms.txt', () => {
  const txt = buildLlmsTxt(
    guides.map((g) => ({ id: g.id, title: g.data.title, description: g.data.description })),
    roms.map((r) => ({ id: r.id, name: r.data.name, description: r.data.description })),
    devices.length,
  )

  it('has the required sections', () => {
    for (const section of [
      '# Root My Android',
      '## For AI agents',
      '## Core pages',
      '## Guides',
      '## Custom ROM catalog',
      '## Device catalog',
      '## Third-party profiles',
      '## Legal',
    ]) {
      expect(txt).toContain(section)
    }
  })

  it('indexes the device catalog with the live collection count', () => {
    expect(devices.length).toBeGreaterThan(0)
    expect(txt).toContain(
      `- [Device catalog](https://rootmyandroid.com/device/): ${devices.length} per-device pages`,
    )
  })

  it('lists every non-draft guide with its Markdown alternate', () => {
    expect(guides.length).toBeGreaterThan(0)
    for (const g of guides) {
      expect(txt).toContain(
        `- [${g.data.title}](https://rootmyandroid.com/guides/${g.id}.md): ${g.data.description}`,
      )
    }
  })

  it('lists every non-draft ROM with its Markdown alternate', () => {
    expect(roms.length).toBeGreaterThan(0)
    for (const r of roms) {
      expect(txt).toContain(
        `- [${r.data.name}](https://rootmyandroid.com/roms/${r.id}.md): ${r.data.description}`,
      )
    }
  })

  it('every rootmyandroid.com link resolves to a real route', () => {
    // URLs owned by the API Worker (rootmyandroid-api), not this repo.
    const external = new Set(['/mcp', '/v1', '/v1/health'])
    const matches = txt.matchAll(/https:\/\/rootmyandroid\.com(\/[^\s)]*)?/g)
    const seen = new Set()
    for (const m of matches) {
      const path = m[1] ?? '/'
      if (seen.has(path)) continue
      seen.add(path)
      if (external.has(path)) continue
      if (path.endsWith('.md')) {
        // /guides/<id>.md or /roms/<id>.md -> content collection entry
        const [section, file] = path.slice(1).split('/')
        expect(
          existsSync(join(WEB, 'src/content', section, file)),
          `${path} has no content entry`,
        ).toBe(true)
        continue
      }
      const clean = path.replace(/\/$/, '')
      const page =
        clean === ''
          ? join(WEB, 'src/pages/index.astro')
          : join(WEB, 'src/pages', `${clean}.astro`)
      const pageIndex = join(WEB, 'src/pages', clean, 'index.astro')
      expect(
        existsSync(page) || existsSync(pageIndex),
        `${path} has no src/pages route`,
      ).toBe(true)
    }
    expect(seen.size).toBeGreaterThan(20)
  })
})

describe('content freshness frontmatter', () => {
  const DAY = /^\d{4}-\d{2}-\d{2}$/
  it('guide dates are well-formed and published <= updated', () => {
    for (const g of guides) {
      if (g.data.published) expect(g.data.published).toMatch(DAY)
      if (g.data.updated) expect(g.data.updated).toMatch(DAY)
      if (g.data.published && g.data.updated) {
        expect(g.data.published <= g.data.updated).toBe(true)
      }
    }
  })
  it('ROM dates are well-formed', () => {
    for (const r of roms) {
      if (r.data.updated) expect(r.data.updated).toMatch(DAY)
    }
  })
})

describe('buildGuideMarkdown', () => {
  it('emits title, description, source, dates and body', () => {
    const md = buildGuideMarkdown({
      id: 'test-guide',
      title: 'Test Guide',
      description: 'A description.',
      published: new Date('2026-01-05T00:00:00Z'),
      updated: new Date('2026-02-07T00:00:00Z'),
      body: 'Body text.',
    })
    expect(md).toContain('# Test Guide\n')
    expect(md).toContain('> A description.\n')
    expect(md).toContain('Source: https://rootmyandroid.com/guides/test-guide/\n')
    expect(md).toContain('Published: 2026-01-05\n')
    expect(md).toContain('Last updated: 2026-02-07\n')
    expect(md.indexOf('Published:')).toBeLessThan(md.indexOf('Last updated:'))
    expect(md.endsWith('\nBody text.\n')).toBe(true)
  })

  it('keeps the byte-exact shape with only an updated date', () => {
    const md = buildGuideMarkdown({
      id: 'x',
      title: 'T',
      description: 'D',
      updated: new Date('2026-10-16T00:00:00Z'),
      body: 'B',
    })
    expect(md).toBe(
      '# T\n\n> D\n\nSource: https://rootmyandroid.com/guides/x/\n\nLast updated: 2026-10-16\n\nB\n',
    )
  })

  it('omits date lines when no dates are set', () => {
    const md = buildGuideMarkdown({ id: 'x', title: 'T', description: 'D', body: 'B' })
    expect(md).toBe('# T\n\n> D\n\nSource: https://rootmyandroid.com/guides/x/\n\nB\n')
  })
})
