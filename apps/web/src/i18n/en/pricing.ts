// src/i18n/en/pricing.ts — English (default locale) pricing-page dictionary.
// Contract for zh/ru/ko (typed `typeof en` there). Glossary from
// en/common.ts applies: product & plan names (Guardian Angel Lite / Pro,
// Rootz Pro) and PRICES are never translated — price stays '$5'/'$15' with
// priceCurrency USD in every locale (AGENTS.md pricing table; the 15%
// crypto discount is enforced server-side, never hard-coded in clients).
// The tier arrays feed BOTH the visible cards AND the Offer JSON-LD — copy
// and structured data cannot drift (per locale).
const pricing = {
  metaTitle: 'Pricing',
  metaDescription:
    'Guardian Angel monitoring (Lite $5/mo, Pro $15/mo) and Rootz Pro professional tools ($15/yr). Top-up subscriptions — no email, no password, no auto-renew.',
  h1Before: 'Two products. ',
  h1Highlight: 'Simple subscriptions.',
  lede:
    'Guardian Angel watches over your devices with monthly monitoring subscriptions. Rootz unlocks professional tooling with a yearly Pro subscription. Both run on the same privacy-first account — no email, no password, just your account number. Add time with a top-up whenever you like — no auto-renew, no stored card.',
  freeH2Name: 'Free',
  // Rendered after the literal '$0' amount in the component.
  freeH2PriceSuffix: ' forever',
  // Also used verbatim as the Free Offer's schema description.
  freeText:
    'Browser device scan (read-only ADB), bootloader & unlock detection, root-method selection, and the full guides library — no account needed.',
  freeCta: 'Start free',
  gaHeadSuffix: '— monthly monitoring',
  rootzHeadSuffix: '— professional tools, yearly',
  guardianTiers: [
    {
      badge: '/img/badge-guardian-lite.webp',
      alt: 'Guardian Angel Lite badge — android robot with one halo',
      name: 'Guardian Angel',
      level: 'Lite',
      price: '$5',
      per: 'month',
      features: [
        'Read installed apps',
        'Read messages',
        'Cover up to 5 devices',
        '30 days per top-up — add time anytime',
      ],
      ctaLabel: 'Subscribe',
      tag: null as string | null,
      featured: false,
    },
    {
      badge: '/img/badge-guardian-pro.webp',
      alt: 'Guardian Angel Pro badge — android robot with two halos',
      name: 'Guardian Angel Pro',
      level: 'Pro',
      price: '$15',
      per: 'month',
      features: [
        'Everything in Guardian Angel Lite',
        'Read call logs',
        'View photos & media',
        'View camera & video',
        'Switch between Lite and Pro anytime',
      ],
      ctaLabel: 'Subscribe',
      tag: 'Recommended' as string | null,
      featured: true,
    },
  ],
  rootzTiers: [
    {
      badge: '/img/brand/colonel-su-staff.webp',
      alt: 'Colonel Su — wise old android robot, staff bearing the SU emblem',
      name: 'Rootz',
      level: 'Pro',
      price: '$15',
      per: 'year',
      features: [
        'Log Analysis',
        'Independent yearly subscription',
        'Combines with any Guardian Angel plan — or stands alone',
      ],
      ctaLabel: 'Subscribe',
      tag: 'New' as string | null,
      featured: true,
    },
  ],
  // Appended to every Offer's schema description (mirrors the footnote).
  offerSuffix:
    'Top-up subscription: add time anytime — no auto-renew, no stored card. Pay with crypto and save 15%.',
  footnote:
    'All plans are top-up subscriptions: add time whenever you like — no auto-renew, no stored card. Guardian Angel subscribers can switch between Lite and Pro anytime; Rootz Pro renews yearly and works with or without a Guardian Angel plan. Pay with crypto and save 15% — lower fees, less administration, passed back to you. Credit card checkout launches as soon as our merchant account is approved. Feature packages are being finalized — the lineup above is the current offer.',
}

export default pricing
