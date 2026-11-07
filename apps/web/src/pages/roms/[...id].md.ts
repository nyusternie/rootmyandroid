// src/pages/roms/[...id].md.ts — raw-Markdown alternate of each ROM entry.
// Prerendered at build time to /roms/<id>.md and linked from each ROM card
// on /roms, so LLM crawlers and agents can consume the entry directly.
// The content-type is enforced in production by public/_headers (static
// hosting serves only the body of an endpoint's Response).
import { getCollection } from 'astro:content'
import type { APIRoute, GetStaticPaths } from 'astro'
import type { CollectionEntry } from 'astro:content'

export const getStaticPaths: GetStaticPaths = async () => {
  const roms = await getCollection('roms', ({ data }) => !data.draft)
  return roms.map((rom) => ({
    params: { id: rom.id },
    props: { rom },
  }))
}

export const GET: APIRoute = ({ props }) => {
  const { rom } = props as { rom: CollectionEntry<'roms'> }
  const d = rom.data
  const lines = [
    `# ${d.name}`,
    '',
    `> ${d.description}`,
    '',
    'Source: https://rootmyandroid.com/roms/',
    `Vendor: ${d.vendor}`,
    `Homepage: ${d.homepage}`,
    `Official source: ${d.source}`,
  ]
  if (d.android) lines.push(`Android: ${d.android}`)
  if (d.devices.length > 0) lines.push(`Devices: ${d.devices.join(', ')}`)
  if (d.updated) {
    lines.push(`Last updated: ${d.updated.toISOString().slice(0, 10)}`)
  }
  const md = lines.join('\n') + `\n\n${rom.body}\n`
  return new Response(md, {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
