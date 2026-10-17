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

const roms = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/roms' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    // Maintainer / project behind the ROM.
    vendor: z.string(),
    // Canonical project page.
    homepage: z.string().url(),
    // Official download / source page (always safe to link).
    source: z.string().url(),
    // Android version(s) this ROM is based on, free-form (e.g. "15", "14–15").
    android: z.string().optional(),
    // Devices this build supports, free-form tags.
    devices: z.array(z.string()).optional().default([]),
    // Whether we have VERIFIED the redistribution terms allow us to mirror
    // the build ourselves. Until true, we only link out to `source` — we do
    // NOT host the zip. (See AGENTS.md: no hosting before license verified.)
    mirrorVerified: z.boolean().optional().default(false),
    // Local mirror path (only used when mirrorVerified is true).
    mirror: z.string().optional(),
    order: z.number().optional(),
    draft: z.boolean().optional().default(false),
  }),
})

export const collections = { guides, roms }
