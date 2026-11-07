// src/pages/guides/[...id].md.ts — raw-Markdown alternate of each guide.
// Prerendered at build time to /guides/<id>.md and linked from the guide's
// HTML page via <link rel="alternate" type="text/markdown"> and from
// /llms.txt, so LLM crawlers and agents can consume the source Markdown
// directly. The content-type is enforced in production by public/_headers
// (static hosting serves only the body of an endpoint's Response).
import { getCollection } from 'astro:content'
import type { APIRoute, GetStaticPaths } from 'astro'
import type { CollectionEntry } from 'astro:content'

export const getStaticPaths: GetStaticPaths = async () => {
  const guides = await getCollection('guides', ({ data }) => !data.draft)
  return guides.map((guide) => ({
    params: { id: guide.id },
    props: { guide },
  }))
}

export const GET: APIRoute = ({ props }) => {
  const { guide } = props as { guide: CollectionEntry<'guides'> }
  const updated = guide.data.updated
    ? `\nLast updated: ${guide.data.updated.toISOString().slice(0, 10)}\n`
    : ''
  const md =
    `# ${guide.data.title}\n\n` +
    `> ${guide.data.description}\n\n` +
    `Source: https://rootmyandroid.com/guides/${guide.id}/\n` +
    updated +
    `\n${guide.body}\n`
  return new Response(md, {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
