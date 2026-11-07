// src/lib/guide-markdown.ts — builds the raw-Markdown body served at
// /guides/<id>.md (endpoint: src/pages/guides/[...id].md.ts). Pure and
// fixture-tested (src/lib/ai-surfaces.test.js) so the endpoint stays thin.
export interface GuideMarkdownInput {
  id: string
  title: string
  description: string
  updated?: Date
  published?: Date
  body: string
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export function buildGuideMarkdown(g: GuideMarkdownInput): string {
  const dates = [
    g.published ? `Published: ${isoDay(g.published)}` : null,
    g.updated ? `Last updated: ${isoDay(g.updated)}` : null,
  ].filter(Boolean)
  const dateBlock = dates.length ? `\n${dates.join('\n')}\n` : ''
  return (
    `# ${g.title}\n\n` +
    `> ${g.description}\n\n` +
    `Source: https://rootmyandroid.com/guides/${g.id}/\n` +
    dateBlock +
    `\n${g.body}\n`
  )
}
