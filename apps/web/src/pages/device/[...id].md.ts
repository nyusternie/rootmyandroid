// src/pages/device/[...id].md.ts — raw-Markdown alternate of each device
// entry. Prerendered at build time to /device/<id>.md and linked from each
// device page, so LLM crawlers and agents can consume the entry directly.
// The content-type is enforced in production by public/_headers (static
// hosting serves only the body of an endpoint's Response). Body assembly
// lives in src/lib/device-markdown.js (unit-tested).
import { getCollection } from 'astro:content'
import type { APIRoute, GetStaticPaths } from 'astro'
import type { CollectionEntry } from 'astro:content'
import { buildDeviceMarkdown } from '../../lib/device-markdown'

export const getStaticPaths: GetStaticPaths = async () => {
  const devices = await getCollection('devices')
  return devices.map((device) => ({
    params: { id: device.id },
    props: { device },
  }))
}

export const GET: APIRoute = ({ props }) => {
  const { device } = props as { device: CollectionEntry<'devices'> }
  return new Response(buildDeviceMarkdown(device), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
