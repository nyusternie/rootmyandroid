// src/lib/llms-txt.ts — builds the /llms.txt site index (llms.txt
// convention, llmstxt.org). Pure and unit-tested
// (src/lib/ai-surfaces.test.js); the endpoint src/pages/llms.txt.ts feeds it
// the non-draft, order-sorted guides and ROMs from the content collections.
// Static sections mirror the sitemap and visible page copy — when a page is
// added/removed, update the matching section here (the unit test fails on
// links that do not resolve to a real route).
export interface LlmsGuide {
  id: string
  title: string
  description: string
}

export interface LlmsRom {
  id: string
  name: string
  description: string
}

export function buildLlmsTxt(guides: LlmsGuide[], roms: LlmsRom[], deviceCount: number): string {
  const guideLines = guides
    .map((g) => `- [${g.title}](https://rootmyandroid.com/guides/${g.id}.md): ${g.description}`)
    .join('\n')
  const romLines = roms
    .map((r) => `- [${r.name}](https://rootmyandroid.com/roms/${r.id}.md): ${r.description}`)
    .join('\n')
  return `<!-- /llms.txt — LLM-readable site index (llms.txt convention, llmstxt.org). GENERATED at build time by src/pages/llms.txt.ts (src/lib/llms-txt.ts + the content collections) — edit the sources, not this output. Keep the static sections in sync with the sitemap and visible page copy. -->

# Root My Android

> Root My Android: release your Android's full power — a free, read-only, in-browser ADB device scan that produces a rooting / upgrade plan matched to your exact model, plus two apps: Rootz (power-user toolkit) and Guardian Angel (parental device management). Accounts are Mullvad-style 16-digit numbers: no email, no password, no conventional signup identity. Pricing: the scan core is free; Guardian Angel Lite is $5 / 30 days; Guardian Angel Pro is $15 / 30 days; Rootz Pro is $15 / 365 days; crypto payments save 15% (enforced server-side).

The site is fully static. All dynamic/backend functionality lives in a public REST API at https://rootmyandroid.com/v1 and a Model Context Protocol (MCP) server at https://rootmyandroid.com/mcp — both require no API key and no registration.

## For AI agents

- [Root My Android for AI agents](https://rootmyandroid.com/agents): agent integration guide — public REST API and MCP server, no API key, no registration
- [MCP server endpoint](https://rootmyandroid.com/mcp): Model Context Protocol (JSON-RPC 2.0 over Streamable HTTP); stateless; tools for accounts, subscription plans, card & crypto checkout, vouchers, payment status, and human support; a GET request returns the human-readable tool catalog
- [API health](https://rootmyandroid.com/v1/health): REST API liveness check; the public API root is /v1

## Core pages

- [Home](https://rootmyandroid.com): free in-browser root scan, the Rootz power-user toolkit, and Guardian Angel parental controls
- [Scan](https://rootmyandroid.com/scan): connect any Android device over USB and scan it in the browser — no installs, no account, nothing leaves the browser
- [Pricing](https://rootmyandroid.com/pricing): Guardian Angel Lite $5/mo, Guardian Angel Pro $15/mo, Rootz Pro $15/yr; top-up subscriptions with no auto-renew and no stored card; 15% off when paying with crypto
- [Download](https://rootmyandroid.com/downloads): direct APK downloads of the Rootz and Guardian Angel Android apps
- [Rootz](https://rootmyandroid.com/rootz): the power-user toolkit for Android — free toolbox plus Pro ($15/365 days); client-side encrypted, AI assistance in development
- [Guardian Angel](https://rootmyandroid.com/guardian-angel): parental device management — free tier, Lite $5/30 days, Pro $15/30 days; client-side encrypted, AI summaries in development
- [Gurus](https://rootmyandroid.com/gurus): the AI assistants — advisors that explain and guide but never act on a device by themselves; pay-per-use from a prepaid Guru Balance, all currently PLANNED
- [Rooting guide](https://rootmyandroid.com/rooting): what rooting is, how bootloader unlocking works, what you gain, and what you risk
- [For Parents](https://rootmyandroid.com/parents): parental controls on Android, and what Guardian Angel adds on top

## Guides

Raw-Markdown alternates: append \`.md\` to any guide URL (also linked via \`<link rel="alternate" type="text/markdown">\` on each guide page).

- [Guides index](https://rootmyandroid.com/guides): step-by-step Android rooting, bootloader, and custom-ROM guides
${guideLines}

## Custom ROM catalog

- [Custom ROMs](https://rootmyandroid.com/roms): curated catalog — crDroid, /e/OS, GrapheneOS, LineageOS — with official sources and device support
${romLines}

## Device catalog

- [Device catalog](https://rootmyandroid.com/devices/): ${deviceCount} per-device pages — codenames, custom-recovery support status, maintainers, download mirrors, and factory-image links for Google Pixels. Raw-Markdown alternates: append \`.md\` to any device URL.

## Third-party profiles

- [ADB](https://rootmyandroid.com/ADB): Google's official tool for communicating with an Android device from a computer — the engine behind the browser-based device scan
- [Magisk](https://rootmyandroid.com/Magisk): the standard systemless rooting method for Android
- [KernelSU](https://rootmyandroid.com/KernelSU): the leading kernel-based root solution for Android GKI devices
- [APatch](https://rootmyandroid.com/APatch): kernel-level root that patches the Android kernel directly
- [TWRP](https://rootmyandroid.com/TWRP): the best-known custom recovery for Android
- [Shizuku](https://rootmyandroid.com/Shizuku): lets ordinary apps use privileged system APIs via ADB — no full root required
- [Dhizuku](https://rootmyandroid.com/Dhizuku): shares Android's Device Owner permissions — enterprise-grade device control without rooting
- [AOSP](https://rootmyandroid.com/AOSP): the open-source core of Android, led by Google
- [LineageOS](https://rootmyandroid.com/LineageOS): the leading open-source custom Android operating system, successor to CyanogenMod
- [GrapheneOS](https://rootmyandroid.com/GrapheneOS): privacy- and security-hardened Android-based OS for Google Pixel phones

## Legal

- [Terms of Service](https://rootmyandroid.com/terms): accounts, subscriptions, payments, acceptable use, and the rooting & unlocking risk disclosure
- [Privacy Policy](https://rootmyandroid.com/privacy): no email, no password, no personal identifiers — exactly what is stored and why
- [Refund Policy](https://rootmyandroid.com/refunds): cryptocurrency payments are irreversible; subscription top-ups are final with narrow exceptions
`
}
