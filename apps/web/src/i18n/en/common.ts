// src/i18n/en/common.ts — English (default locale) chrome dictionary:
// header, footer, language switcher, sitewide default meta. This file's
// shape is the contract for all other locales (typed `typeof en` there).
// GLOSSARY — never translate: brand & product names (Root My Android,
// Guardian Angel, Rootz, Gurus), plan names (Free / Lite / Pro),
// third-party names (Magisk, TWRP, GrapheneOS…), technical commands/paths,
// and all prices ($5 / $15 — AGENTS.md pricing table). Link anchor texts
// and feature descriptions DO get translated.
const common = {
  // Sitewide fallback <meta name="description"> (Base.astro default).
  metaDescription:
    'Root My Android — scan your Android device and get a rooting / upgrade plan. No email, no password. Simple top-up subscriptions.',
  // Header nav.
  navGuides: 'Guides',
  navRoms: 'ROMs',
  navGurus: 'Gurus',
  navScan: 'Scan NOW!',
  // aria-label of the language switcher (header + footer).
  langLabel: 'Language',
  // Footer.
  footerTagline:
    'Scan your Android device and get a rooting / upgrade plan. No email, no password.',
  footerProduct: 'Product',
  footerLegal: 'Legal',
  footerScan: 'Scan',
  footerGuides: 'Guides',
  footerWhy: 'Why Root?',
  footerRoms: 'ROMs',
  footerDevices: 'Devices',
  footerRootz: 'Rootz',
  footerGa: 'Guardian Angel',
  footerGurus: 'Gurus',
  footerParents: 'For Parents',
  footerAgents: 'For Agents',
  footerMcp: 'MCP',
  footerTerms: 'Terms',
  footerPrivacy: 'Privacy',
  footerRefunds: 'Refunds',
}

export default common
