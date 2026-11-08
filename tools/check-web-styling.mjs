// tools/check-web-styling.mjs — CI gate for AGENTS.md hard rule 7 ("Web
// styling is 100% Tailwind", owner ruling 2026-11-08). Fails the build if
// apps/web sources contain:
//   - <style> blocks (scoped or global) in .astro files
//   - static inline style="..." attributes
//   - style={...} expressions that do NOT carry a CSS custom property
//     (the one sanctioned dynamic-value escape hatch: set --vars, consume
//     them with arbitrary-value utilities like max-w-(--profile-img-w))
// Runtime `.style.*` writes in client scripts (e.g. scan.ts's SVG gauge)
// are allowed — only static markup styling is gated.
// Run: node tools/check-web-styling.mjs   (wired into root `pnpm check`)

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../apps/web/src', import.meta.url))
const EXTENSIONS = new Set(['.astro', '.ts', '.tsx'])

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) yield path
  }
}

const violations = []
for (const file of walk(root)) {
  const rel = relative(process.cwd(), file)
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`
    if (/<style[\s>]/.test(line)) {
      violations.push(`${at}: <style> block — use Tailwind utilities / global.css @layer classes`)
    }
    // style="..." is banned UNLESS the value is template-interpolated
    // (${...}) — i.e. a runtime-computed dynamic value (the sanctioned
    // exception, e.g. scan.ts's SVG gauge stroke-dasharray).
    const staticStyle = line.match(/style="([^"]*)"/)
    if (staticStyle && !staticStyle[1].includes('${')) {
      violations.push(`${at}: static style="..." attribute — use Tailwind utilities`)
    }
    // style={...} is allowed ONLY when it sets a CSS custom property (--)
    const expr = line.match(/style=\{[^}]*\}/)
    if (expr && !expr[0].includes('`--') && !expr[0].includes("'--") && !expr[0].includes('"--')) {
      violations.push(
        `${at}: style={...} must only set a CSS custom property (--var) consumed by a utility`
      )
    }
  })
}

if (violations.length > 0) {
  console.error(`check-web-styling: ${violations.length} violation(s) of AGENTS.md rule 7:\n`)
  for (const v of violations) console.error(`  ${v}`)
  console.error('\nAll apps/web styling must flow through Tailwind (see AGENTS.md rule 7).')
  process.exit(1)
}
console.log('check-web-styling: OK — 100% Tailwind (no <style> blocks, no static inline styles)')
