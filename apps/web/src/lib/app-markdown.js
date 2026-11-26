// src/lib/app-markdown.js — builds the raw-Markdown alternate of an app
// detail page, served prerendered at /app/<package>.md (endpoint:
// src/pages/app/[...id].md.ts; content-type enforced by public/_headers).
// Pure, so it is unit-tested (src/lib/app-markdown.test.js). Facts only,
// mirroring the rendered page: every line maps to a section of
// src/layouts/AppDetail.astro. The page's own copy (the collection body) is
// appended verbatim, so the Markdown and the HTML never drift.
export function buildAppMarkdown(app) {
  const d = app.data
  const url = `https://rootmyandroid.com/app/${app.id}/`
  const lines = [
    `# ${d.name} (${app.id})`,
    '',
    `> ${d.summary}`,
    '',
    `Source: ${url}`,
    `Package name: ${app.id}`,
    `Developer: ${d.developer}`,
    `Category: ${d.category}`,
    `Official: ${d.official}`,
  ]
  if (d.source) lines.push(`Distributed from: ${d.source}`)
  if (d.license) lines.push(`License: ${d.license}`)
  lines.push(`Normally a system app: ${d.system ? 'yes' : 'no'}`)
  if (d.profile) lines.push(`Profile page: https://rootmyandroid.com${d.profile}`)
  lines.push(`Facts checked: ${d.checked}`)
  if (d.related.length > 0) {
    lines.push('', 'Related:')
    for (const link of d.related) {
      lines.push(`- ${link.label}: https://rootmyandroid.com${link.href}`)
    }
  }
  if (app.body) {
    lines.push('', '---', '', app.body.trim())
  }
  return lines.join('\n') + '\n'
}
