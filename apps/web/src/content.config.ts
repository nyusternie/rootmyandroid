// src/content.config.ts — Astro content collections (v5+ API).
import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // First-publication date (ISO yyyy-mm-dd, sourced from the guide's
    // first git commit). Rendered visibly on the guide page and emitted as
    // datePublished in its TechArticle JSON-LD.
    published: z.coerce.date().optional(),
    // Last content-change date (ISO yyyy-mm-dd). Rendered visibly on the
    // guide page and emitted as dateModified in its TechArticle JSON-LD
    // (structured data mirrors copy) — a freshness signal for search and
    // answer engines. EDITORS: bump this whenever the content changes.
    updated: z.coerce.date().optional(),
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
    // Last content-change date (ISO yyyy-mm-dd). Rendered on the ROM card
    // and in its /roms/<id>.md Markdown alternate. EDITORS: bump this
    // whenever the content changes.
    updated: z.coerce.date().optional(),
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

const devices = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/devices' }),
  schema: z.object({
    // Display name of the device, e.g. "Google Pixel XL".
    title: z.string(),
    // Brand / manufacturer, e.g. "Google". Imported verbatim — casing
    // variants ('Motorola' vs 'motorola') are merged for DISPLAY on the
    // /device index, never in the source file.
    oem: z.string(),
    // Device codename, e.g. "marlin". May be a multi-codename string for
    // unified builds ('cheeseburger/dumpling') — rendered verbatim.
    codename: z.string(),
    // Official TWRP support status. The generated catalog (see
    // tools/import-twrp-devices.mjs) contains exactly 'Current' only;
    // anything else must render honestly (never overstate support).
    supportstatus: z.string(),
    // Listed TWRP maintainer(s); omitted when none is listed.
    maintainer: z.array(z.string()).optional().default([]),
    // Official device tree repository; omitted when none is listed.
    devicetree: z.string().url().optional(),
    // Single folder on the official download mirrors (dl.twrp.me/<folder>);
    // omitted when no single canonical folder exists for the device (e.g.
    // multi-SKU variants) — never invent one.
    downloadfolder: z.string().optional(),
    // Labeled per-SKU download mirrors, parsed from pipe-joined label/folder
    // pairs by the importer (e.g. ROG Phone 5 → I005D, ROG Phone 5S →
    // I005DS); used when no single canonical folder exists.
    variants: z
      .array(z.object({ label: z.string(), folder: z.string() }))
      .optional(),
    // Maker's factory-image archive (Google Pixels).
    factoryimages: z.string().url().optional(),
    // Cautionary note (original prose, source-linked) rendered as a
    // callout — e.g. Google's anti-rollback bootloader warnings for Pixels.
    notes: z.string().optional(),
    // Date the device was (re-)imported into this catalog (ISO yyyy-mm-dd).
    // Rendered visibly as "Listed" and emitted as dateModified in the
    // page's TechArticle JSON-LD (structured data mirrors copy).
    updated: z.coerce.date(),
  }),
})

export const collections = { guides, roms, devices }
