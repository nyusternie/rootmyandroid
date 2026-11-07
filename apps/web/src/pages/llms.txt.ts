// src/pages/llms.txt.ts — generated /llms.txt (llms.txt convention).
// Replaces the hand-maintained public/llms.txt: the Guides and Custom ROM
// catalog bullets are built from the content collections at build time, so
// adding a guide or ROM updates the index automatically. Body assembly lives
// in src/lib/llms-txt.ts (unit-tested in src/lib/ai-surfaces.test.js);
// static hosting serves the prerendered body as text/plain (.txt suffix).
import { getCollection } from 'astro:content'
import type { APIRoute } from 'astro'
import { buildLlmsTxt } from '../lib/llms-txt'

const byOrder = (
  a: { data: { order?: number } },
  b: { data: { order?: number } },
) => (a.data.order ?? 999) - (b.data.order ?? 999)

export const GET: APIRoute = async () => {
  const guides = (await getCollection('guides', ({ data }) => !data.draft)).sort(byOrder)
  const roms = (await getCollection('roms', ({ data }) => !data.draft)).sort(byOrder)
  const body = buildLlmsTxt(
    guides.map((g) => ({ id: g.id, title: g.data.title, description: g.data.description })),
    roms.map((r) => ({ id: r.id, name: r.data.name, description: r.data.description })),
  )
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
