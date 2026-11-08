// apps/web/astro.config.mjs
import { defineConfig } from 'astro/config'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'

// Every external link opens in a new tab (owner ruling 2026-11-08).
// Content is authored without target attributes; this hook rewrites the
// emitted static HTML after `astro build`: any <a> whose href is http(s)
// and NOT on rootmyandroid.com gets target="_blank", with rel="noopener"
// merged into an existing rel (or added). Same-host absolute links, and
// links that already carry a target, stay untouched. This also covers
// links rendered dynamically from collection data (ROM sources, device
// mirrors) which cannot be annotated statically.
function externalLinksNewTab() {
  return {
    name: 'external-links-new-tab',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const stack = [fileURLToPath(dir)]
        while (stack.length) {
          const d = stack.pop()
          for (const e of await readdir(d, { withFileTypes: true })) {
            const p = `${d}/${e.name}`
            if (e.isDirectory()) {
              stack.push(p)
              continue
            }
            if (!e.name.endsWith('.html')) continue
            const html = await readFile(p, 'utf8')
            let changed = false
            const out = html.replace(/<a\b[^>]*>/g, (tag) => {
              if (/\btarget\s*=/.test(tag)) return tag
              const m = tag.match(/\bhref\s*=\s*"([^"]*)"/)
              if (!m || !/^https?:\/\//.test(m[1])) return tag
              try {
                const host = new URL(m[1]).hostname
                if (host === 'rootmyandroid.com' || host.endsWith('.rootmyandroid.com')) return tag
              } catch {
                return tag
              }
              changed = true
              let t = tag
              const r = t.match(/\brel\s*=\s*"([^"]*)"/)
              if (r) {
                const parts = r[1].split(/\s+/).filter(Boolean)
                if (!parts.includes('noopener')) parts.push('noopener')
                t = t.replace(r[0], `rel="${parts.join(' ')}"`)
              } else {
                t = t.replace(/>$/, ' rel="noopener">')
              }
              return t.replace(/>$/, ' target="_blank">')
            })
            if (changed) await writeFile(p, out)
          }
        }
      },
    },
  }
}

// Purely static marketing/docs site. No SSR, no adapters — `astro build`
// emits plain HTML/CSS to dist/, deployed to Cloudflare Pages.
// The only client JS is the vanilla <script> on /account, which talks to the
// API at rootmyandroid.com/v1 (a separate Cloudflare Worker, not this site).
export default defineConfig({
  site: 'https://rootmyandroid.com',
  output: 'static',
  // Auto-generated sitemap-index.xml (+ per-page sitemaps) at build time.
  // customPages: /mcp is served by the API Worker (rootmyandroid-api repo),
  // not built from this repo — the auto-sitemap never sees it, so it is
  // listed explicitly.
  integrations: [sitemap({ customPages: ['https://rootmyandroid.com/mcp'] }), externalLinksNewTab()],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    // /account -> /account/index.html etc. (clean URLs, Pages-friendly)
    format: 'directory',
  },
})
