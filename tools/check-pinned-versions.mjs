// tools/check-pinned-versions.mjs — CI gate for the owner's pinning ruling
// (2026-11-08): "ALL PACKAGE VERSIONS PINNED — NO PACKAGE SHOULD BE ABLE TO
// BE INSTALLED UN-PINNED." Every dependency specifier in every workspace
// package.json must be EXACT:
//   - a pinned semver (e.g. "4.3.3", "0.88.0-rc.4")  — no ^, ~, *, x-ranges,
//     comparators (>=, <), unions (||), or dist-tags (latest)
//   - or an inherently exact protocol: workspace:*, file:, link:
// `.npmrc` carries save-exact=true so `pnpm add` writes exact versions by
// default; this script is the enforcement net (wired into root `pnpm check`).
// Run: node tools/check-pinned-versions.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// Discover workspace package.json files from pnpm-workspace.yaml globs
// (apps/*, packages/*) plus the repo root.
const workspaceYaml = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8')
const globs = [...workspaceYaml.matchAll(/^\s*-\s*'([^']+)'$/gm)].map((m) => m[1])
const manifestPaths = [join(repoRoot, 'package.json')]
for (const glob of globs) {
  const star = glob.indexOf('*')
  if (star === -1) {
    manifestPaths.push(join(repoRoot, glob, 'package.json'))
    continue
  }
  const base = join(repoRoot, glob.slice(0, star))
  if (!existsSync(base)) continue
  for (const entry of readdirSync(base)) {
    const candidate = join(base, entry, 'package.json')
    if (existsSync(candidate)) manifestPaths.push(candidate)
  }
}

const EXACT_PROTOCOL = /^(workspace:|file:|link:|portal:)/
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const KINDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']

const violations = []
for (const manifestPath of manifestPaths) {
  const rel = manifestPath.slice(repoRoot.length + 1)
  const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'))
  for (const kind of KINDS) {
    for (const [name, spec] of Object.entries(pkg[kind] ?? {})) {
      if (EXACT_PROTOCOL.test(spec) || EXACT_SEMVER.test(spec)) continue
      violations.push(`${rel} [${kind}] ${name}: "${spec}" is not an exact pinned version`)
    }
  }
}

if (violations.length > 0) {
  console.error(`check-pinned-versions: ${violations.length} un-pinned specifier(s):\n`)
  for (const v of violations) console.error(`  ${v}`)
  console.error(
    '\nAll dependencies must be pinned to an exact version (owner ruling 2026-11-08).'
  )
  process.exit(1)
}
console.log(
  `check-pinned-versions: OK — every specifier in ${manifestPaths.length} manifests is exact`
)
