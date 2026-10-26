// src/scripts/analytics.ts — first-party analytics beacon (framework-free).
// Reports pageviews, time-on-page, and click events to our OWN API
// (POST /v1/analytics/event on the same origin). No cookies, no
// fingerprinting, no third parties: the server derives a daily-rotating
// salted hash from IP+UA so "visitors" can't be tracked across days, and
// pageview rows never store an IP address. See /privacy for the policy.
//
// Three ways to record click events (all land as source='client' rows in
// the events table; funnel steps are server-side only, so nothing here can
// forge a purchase):
//   1. window.rmaEvent('name', { optional: 'detail' })  — imperative
//   2. <button data-rma-event="name">                    — declarative
//   3. automatic: download links (.zip/.pdf/.apk/…) and outbound links
//      are detected from the click target's href.

const ENDPOINT = '/v1/analytics/event'

// Download-file extensions we auto-track (MOD zips, PDF guides, images).
const DOWNLOAD_EXT =
  /\.(zip|pdf|apk|img|tar|gz|tgz|xz|7z|rar|exe|dmg|iso|bin|json|csv)$/i

// Wire contract (rootmyandroid-api src/lib/analytics.js — SHORT field names):
//   {type:'pv',  id, p, r, t, w, h, lang, us, um, uc, uct, ut}
//   {type:'dur', id, d}         — d = VISIBLE seconds on page
//   {type:'ev',  name, detail, p}
interface UtmParams {
  us?: string
  um?: string
  uc?: string
  uct?: string
  ut?: string
}

// Stable id for this pageview; the 'dur' follow-up references it.
const pageviewId = crypto.randomUUID()

// ---------------------------------------------------------------------------
// Transport: sendBeacon with a JSON Blob (content-type application/json),
// falling back to keepalive fetch. Never throws, never breaks the page.
// ---------------------------------------------------------------------------

function send(payload: Record<string, unknown>): void {
  try {
    const body = JSON.stringify(payload)
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon(ENDPOINT, blob)) return
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {})
  } catch {
    // Analytics must never break the page.
  }
}

// ---------------------------------------------------------------------------
// Pageview: path/title/referrer/UTMs/screen/lang, once per page load.
// ---------------------------------------------------------------------------

function utmParams(): UtmParams {
  const q = new URLSearchParams(location.search)
  const utm: UtmParams = {}
  const keys = [
    ['utm_source', 'us'],
    ['utm_medium', 'um'],
    ['utm_campaign', 'uc'],
    ['utm_content', 'uct'],
    ['utm_term', 'ut'],
  ] as const
  for (const [param, field] of keys) {
    const value = q.get(param)
    if (value) utm[field] = value
  }
  return utm
}

function sendPageview(): void {
  send({
    type: 'pv',
    id: pageviewId,
    p: location.pathname,
    t: document.title,
    r: document.referrer || undefined,
    ...utmParams(),
    w: screen.width,
    h: screen.height,
    lang: navigator.language,
  })
}

// ---------------------------------------------------------------------------
// Time-on-page: accumulate VISIBLE time only (tab switches pause the clock).
// Sent on pagehide (final) and on visibilitychange→hidden (earlier flush —
// pagehide is not guaranteed to fire/flush on mobile). The server treats
// 'dur' as last-write-wins on the pageview id, so duplicates are harmless.
// ---------------------------------------------------------------------------

let visibleStart =
  document.visibilityState === 'visible' ? Date.now() : 0
let visibleTotal = 0

function visibleSeconds(): number {
  const total =
    visibleTotal +
    (document.visibilityState === 'visible' && visibleStart
      ? Date.now() - visibleStart
      : 0)
  return Math.round(total / 1000)
}

function sendDuration(): void {
  const duration = visibleSeconds()
  if (duration <= 0) return
  send({ type: 'dur', id: pageviewId, d: duration })
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    visibleTotal += visibleStart ? Date.now() - visibleStart : 0
    visibleStart = 0
    sendDuration()
  } else if (document.visibilityState === 'visible' && !visibleStart) {
    visibleStart = Date.now()
  }
})

window.addEventListener('pagehide', () => {
  if (visibleStart) {
    visibleTotal += Date.now() - visibleStart
    visibleStart = 0
  }
  sendDuration()
})

// ---------------------------------------------------------------------------
// Click events.
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    rmaEvent?: (name: string, detail?: Record<string, unknown> | string) => void
  }
}

function recordEvent(
  name: string,
  detail?: Record<string, unknown> | string,
): void {
  let detailStr: string | undefined
  if (typeof detail === 'string') detailStr = detail
  else if (detail) {
    try {
      detailStr = JSON.stringify(detail)
    } catch {
      detailStr = undefined
    }
  }
  if (detailStr && detailStr.length > 500) detailStr = detailStr.slice(0, 500)
  send({ type: 'ev', name, detail: detailStr, p: location.pathname })
}

window.rmaEvent = recordEvent

// Declarative: any element with data-rma-event (optional
// data-rma-event-detail) reports a click under that event name.
document.querySelectorAll<HTMLElement>('[data-rma-event]').forEach((el) => {
  el.addEventListener('click', () => {
    const name = el.dataset.rmaEvent
    if (!name) return
    recordEvent(name, el.dataset.rmaEventDetail)
  })
})

// Automatic: download links and outbound links, via one delegated listener
// (also catches links rendered later, unlike per-element binding).
document.addEventListener('click', (event) => {
  const anchor = (event.target as Element | null)?.closest?.('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return
  // data-rma-event wins; don't double-report as download/outbound.
  if (anchor.dataset.rmaEvent) return

  const url = new URL(anchor.href, location.href)
  if (url.origin !== location.origin) {
    recordEvent('outbound', { href: url.hostname })
    return
  }
  if (anchor.hasAttribute('download') || DOWNLOAD_EXT.test(url.pathname)) {
    recordEvent('download', { href: url.pathname })
  }
})

// ---------------------------------------------------------------------------
// Go. Skip automation (webdriver) clients; the server also filters bot UAs.
// ---------------------------------------------------------------------------

if (!navigator.webdriver) {
  sendPageview()
}

// This file has no imports/exports of its own; force module scope so the
// `declare global` augmentation above is legal.
export {}
