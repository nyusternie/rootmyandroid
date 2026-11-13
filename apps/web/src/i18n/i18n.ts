// src/i18n/i18n.ts — locale registry + routing helpers. Build-time only
// (zero client JS — AGENTS.md rule 4). Single source of truth for:
//   - which locales exist (LOCALES) and their own-language display names
//   - which routes are localized (LOCALIZED_ROUTES) — a page is added only
//     when ALL of its zh/ru/ko translations ship, so hreflang alternates,
//     the language switcher, and localized links never point at an
//     untranslated page (structured data mirrors visible copy)
//   - path helpers (lp / defaultPath / alternateLinks)
// Dictionaries live per locale + section in ./<locale>/<section>.ts; every
// non-English section file is typed `typeof en` of its English counterpart,
// so `pnpm check` (CI gate) fails on any missing or extra key.
import enCommon from './en/common'
import zhCommon from './zh/common'
import ruCommon from './ru/common'
import koCommon from './ko/common'
import enHome from './en/home'
import zhHome from './zh/home'
import ruHome from './ru/home'
import koHome from './ko/home'
import enPricing from './en/pricing'
import zhPricing from './zh/pricing'
import ruPricing from './ru/pricing'
import koPricing from './ko/pricing'
import enGuardian from './en/guardian'
import zhGuardian from './zh/guardian'
import ruGuardian from './ru/guardian'
import koGuardian from './ko/guardian'
import enRootz from './en/rootz'
import zhRootz from './zh/rootz'
import ruRootz from './ru/rootz'
import koRootz from './ko/rootz'
import enDownload from './en/download'
import zhDownload from './zh/download'
import ruDownload from './ru/download'
import koDownload from './ko/download'

export const LOCALES = ['en', 'zh', 'ru', 'ko'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

// Display names — each locale named in its OWN language.
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  zh: '中文',
  ru: 'Русский',
  ko: '한국어',
}

// Flag emoji per locale — display-only, used by the language-switcher
// dropdown (LangSwitcher.astro). English matches the en_US og:locale. On
// platforms without color-flag emoji (Windows) these degrade to the
// readable two-letter codes (US / CN / RU / KO).
export const LOCALE_FLAGS: Record<Locale, string> = {
  en: '🇺🇸',
  zh: '🇨🇳',
  ru: '🇷🇺',
  ko: '🇰🇷',
}

// Open Graph locale codes (og:locale uses the language_TERRITORY form).
export const OG_LOCALES: Record<Locale, string> = {
  en: 'en_US',
  zh: 'zh_CN',
  ru: 'ru_RU',
  ko: 'ko_KR',
}

// Default-locale paths ('/' = homepage; no trailing slash) that exist in
// ALL locales. EMPTY until a page's translations actually ship.
export const LOCALIZED_ROUTES: readonly string[] = ['/', '/pricing', '/guardian-angel', '/rootz', '/downloads']

const DICTS = {
  en: { common: enCommon, home: enHome, pricing: enPricing, guardian: enGuardian, rootz: enRootz, download: enDownload },
  zh: { common: zhCommon, home: zhHome, pricing: zhPricing, guardian: zhGuardian, rootz: zhRootz, download: zhDownload },
  ru: { common: ruCommon, home: ruHome, pricing: ruPricing, guardian: ruGuardian, rootz: ruRootz, download: ruDownload },
  ko: { common: koCommon, home: koHome, pricing: koPricing, guardian: koGuardian, rootz: koRootz, download: koDownload },
}

export function localeOf(currentLocale: string | undefined): Locale {
  return (LOCALES as readonly string[]).includes(currentLocale ?? '')
    ? (currentLocale as Locale)
    : DEFAULT_LOCALE
}

export function dictFor(currentLocale: string | undefined) {
  return DICTS[localeOf(currentLocale)]
}

// Strip the locale prefix from a URL path → the default-locale path
// ('/' for the homepage; no trailing slash elsewhere).
export function defaultPath(pathname: string): string {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  for (const l of LOCALES) {
    if (l === DEFAULT_LOCALE) continue
    if (p === `/${l}`) return '/'
    if (p.startsWith(`/${l}/`)) return p.slice(l.length + 1)
  }
  return p === '' ? '/' : p
}

// Locale-aware internal link. Localized routes get the locale prefix —
// except the default locale, which NEVER gets one (existing English URLs
// are canonical and keep working). Unlocalized routes always resolve to
// the English page (the only version that exists).
export function lp(locale: Locale, path: string): string {
  const bare = path === '' ? '/' : path.length > 1 ? path.replace(/\/+$/, '') : path
  if (!LOCALIZED_ROUTES.includes(bare)) return bare
  return locale === DEFAULT_LOCALE ? bare : `/${locale}${bare === '/' ? '' : bare}`
}

export interface AlternateLink {
  hreflang: string
  href: string
}

// hreflang <link> set for the current page: one per locale + x-default
// (→ the English URL). EMPTY for pages that are not localized: an
// alternate is never claimed for a page that has no translation. Hrefs
// use the trailing-slash form to match the canonical/sitemap URL style.
export function alternateLinks(site: URL | undefined, pathname: string): AlternateLink[] {
  const bare = defaultPath(pathname)
  if (!LOCALIZED_ROUTES.includes(bare)) return []
  const abs = (l: Locale) => {
    const p = lp(l, bare)
    return new URL(p === '/' || p.endsWith('/') ? p : `${p}/`, site).href
  }
  return [
    ...LOCALES.map((l) => ({ hreflang: l, href: abs(l) })),
    { hreflang: 'x-default', href: abs(DEFAULT_LOCALE) },
  ]
}
