// src/content.config.ts — Astro content collections (v5+ API).
import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // Optional ordering / status flags for later use.
    order: z.number().optional(),
    draft: z.boolean().optional().default(false),
  }),
})

export const collections = { guides }
