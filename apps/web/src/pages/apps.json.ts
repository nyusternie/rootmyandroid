// src/pages/apps.json.ts — the build-time manifest of curated app pages
// (dist/apps.json). The /guardian list reads it to decide which rows may be
// links: static hosting cannot answer "does /app/<package> exist?" without a
// request, and a link to a missing page is a 404 (owner ruling 2026-11-26).
// Generated from the collection, so it can never drift from what was built.
import { getCollection } from 'astro:content'
import type { APIRoute } from 'astro'

export const GET: APIRoute = async () => {
  const apps = await getCollection('apps')
  const packages = apps.map((app) => app.id).sort()
  return new Response(JSON.stringify({ ok: true, count: packages.length, packages }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
