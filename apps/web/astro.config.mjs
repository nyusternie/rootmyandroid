// apps/web/astro.config.mjs
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'

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
  integrations: [sitemap({ customPages: ['https://rootmyandroid.com/mcp'] })],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    // /account -> /account/index.html etc. (clean URLs, Pages-friendly)
    format: 'directory',
  },
})
