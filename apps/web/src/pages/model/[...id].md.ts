// src/pages/model/[...id].md.ts — raw-Markdown alternate of each model
// profile (/model/<id>.md), so LLM crawlers and agent consumers can read
// the profile — verified numbers, benchmark tables, provenance — without
// parsing HTML. Mirrors the guides' endpoint (src/pages/guides/
// [...id].md.ts); the content-type is enforced in production by
// public/_headers.
import { getCollection } from 'astro:content'
import type { APIRoute, GetStaticPaths } from 'astro'
import type { CollectionEntry } from 'astro:content'

export const getStaticPaths: GetStaticPaths = async () => {
  const models = await getCollection('models', ({ data }) => !data.draft)
  return models.map((model) => ({
    params: { id: model.id },
    props: { model },
  }))
}

export const GET: APIRoute = ({ props }) => {
  const { model } = props as { model: CollectionEntry<'models'> }
  const d = model.data
  const verifiedIso = d.verified.toISOString().slice(0, 10)
  const updatedIso = d.updated.toISOString().slice(0, 10)
  const gib = (bytes: number) => (bytes / 2 ** 30).toFixed(2)
  const int = (n: number) => n.toLocaleString('en-US')

  const lines: string[] = [
    `# ${d.name} — on-device model profile`,
    '',
    `> ${d.description}`,
    '',
    `- HF data verified: ${verifiedIso}`,
    `- Updated: ${updatedIso}`,
    `- HTML page: https://rootmyandroid.com/model/${model.id}/`,
    '',
    '## Verified numbers (Hugging Face API)',
    '',
    `- Family: ${d.family}`,
    `- Base repository: https://huggingface.co/${d.hfBase}`,
    `- GGUF repository: https://huggingface.co/${d.hfGguf}`,
    `- License: ${d.license}`,
    `- Monthly downloads: ${int(d.downloadsMonthly)}`,
    `- Parameters (unique, safetensors.total): ${int(d.paramsUnique)}`,
    `- Parameters (GGUF metadata, gguf.total): ${d.paramsGguf === null ? 'not extracted' : int(d.paramsGguf)}`,
    `- Native context (config.json): ${int(d.contextTokens)} tokens`,
    `- GGUF-reported context: ${d.contextGguf === null ? 'not extracted' : `${int(d.contextGguf)} tokens`}`,
    `- Quant: ${d.quant}`,
    `- GGUF file: ${d.ggufFile}`,
    `- GGUF size: ${int(d.ggufBytes)} bytes = ${gib(d.ggufBytes)} GiB`,
    `- Catalog tier (free RAM): ${d.tier}`,
  ]

  if (d.benchmarks.length > 0) {
    lines.push('', '## Measured benchmarks', '')
    for (const b of d.benchmarks) {
      const bIso = b.date.toISOString().slice(0, 10)
      lines.push(
        `### ${bIso} — ${b.device}`,
        '',
        `Toolchain: ${b.toolchain}`,
        `Raw log: ${b.log}`,
        '',
        '| Cell | CPU mask | Threads | Test | Tokens/s |',
        '| --- | --- | ---: | --- | ---: |',
      )
      for (const c of b.cells) {
        for (const t of c.tests) {
          lines.push(
            `| ${c.name} | ${c.mask} | ${c.threads} | ${t.name} | ${t.tps.toFixed(2)} ± ${t.err.toFixed(2)} |`,
          )
        }
      }
      if (b.notes) lines.push('', `Notes: ${b.notes}`)
      lines.push('')
    }
  }

  lines.push('', (model.body ?? '').trim(), '')

  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
