// src/pages/app/[...id].md.ts — raw-Markdown alternate of each app detail
// page. Prerendered to /app/<package>.md and linked from the page, so LLM
// crawlers and agents can consume the entry directly (same pattern as
// /device/<id>.md). The content-type is enforced in production by
// public/_headers. Body assembly lives in src/lib/app-markdown.js
// (unit-tested).
import { getCollection } from 'astro:content'
import type { APIRoute, GetStaticPaths } from 'astro'
import type { CollectionEntry } from 'astro:content'
import { buildAppMarkdown } from '../../lib/app-markdown'

export const getStaticPaths: GetStaticPaths = async () => {
  const apps = await getCollection('apps')
  return apps.map((app) => ({ params: { id: app.id }, props: { app } }))
}

export const GET: APIRoute = ({ props }) => {
  const { app } = props as { app: CollectionEntry<'apps'> }
  return new Response(buildAppMarkdown(app), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
