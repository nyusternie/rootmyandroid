// src/pages/guides/[...id].md.ts — raw-Markdown alternate of each guide.
// Prerendered at build time to /guides/<id>.md and linked from the guide's
// HTML page via <link rel="alternate" type="text/markdown"> and from
// /llms.txt, so LLM crawlers and agents can consume the source Markdown
// directly. The content-type is enforced in production by public/_headers
// (static hosting serves only the body of an endpoint's Response). Body
// assembly lives in src/lib/guide-markdown.ts (unit-tested in
// src/lib/ai-surfaces.test.js) so this endpoint stays thin.
import { getCollection } from 'astro:content'
import type { APIRoute, GetStaticPaths } from 'astro'
import type { CollectionEntry } from 'astro:content'
import { buildGuideMarkdown } from '../../lib/guide-markdown'

export const getStaticPaths: GetStaticPaths = async () => {
  const guides = await getCollection('guides', ({ data }) => !data.draft)
  return guides.map((guide) => ({
    params: { id: guide.id },
    props: { guide },
  }))
}

export const GET: APIRoute = ({ props }) => {
  const { guide } = props as { guide: CollectionEntry<'guides'> }
  return new Response(
    buildGuideMarkdown({
      id: guide.id,
      title: guide.data.title,
      description: guide.data.description,
      updated: guide.data.updated,
      published: guide.data.published,
      body: guide.body ?? '',
    }),
    { headers: { 'content-type': 'text/markdown; charset=utf-8' } },
  )
}
