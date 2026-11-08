// src/scripts/support.ts — visitor support widget (framework-free): a
// floating chat button bottom-right on the app pages. CHAT-FIRST design
// (owner decision 2026-11-03): no mode picker — the panel opens straight
// onto the thread and the visitor just sends a message. Conversations are
// always created 'realtime' (anonymous); if no admin reply arrives within
// NUDGE_AFTER_MS we ask ONCE for an email, posted into the same thread —
// the API has no presence endpoint and cannot attach an email after
// creation (verified against rootmyandroid-api src/lib/support.js
// 2026-11-03). Anonymous by design: no sign-in, no cookies. Identity is a
// 64-hex bearer token returned ONCE at creation, kept in
// localStorage['rma-support'] and presented as x-support-token. Safety:
// message bodies render via textContent only (never innerHTML); pre-wrap
// keeps multi-line formatting.
// GURU LAYER (docs/HANDOFF-2026-11-08-guru-support-chat.md §4/§4.1): Sage
// (free) auto-answers every visitor message server-side; The Elder (paid
// from Guru Balance) is requested via the quote -> consent -> POST .../guru
// flow; "Talk to a human" escalates (POST .../escalate) and mutes Sage.
// Pending turns are NOT messages: they arrive as `pending_guru` on the poll
// payload; only terminal states (complete|failed) become thread rows with
// `author` + `guru` metadata. All USD amounts are strings rendered verbatim.
// Graceful degradation: a 404 from any Guru endpoint hides the Guru UI
// (pre-BE-1 backends) and the widget behaves exactly as before.
import {
  createSupportConversation,
  getSupportMessages,
  postSupportEscalate,
  postSupportGuru,
  postSupportGuruQuote,
  postSupportMessage,
} from '../lib/api.js'

interface SupportSession {
  id: string
  token: string
  nudgeDone?: boolean // email nudge already saved or dismissed
  seen?: number       // highest message id the visitor has seen (unread badge)
}

interface GuruMeta {
  name: 'Sage' | 'The Elder'
  status: 'pending' | 'complete' | 'failed'
  chargeUsd: string | null // USD string; render verbatim, never parse (§4.1-F2)
  cachedShare: number | null
}

type Author = 'visitor' | 'team' | 'sage' | 'elder'

interface SupportMessage {
  id: number
  sender: 'visitor' | 'admin'
  author?: Author // additive (§4.1-F1); absent on pre-Guru rows
  guru?: GuruMeta // present on Guru turns only
  body: string
  ts: number
}

// Pending Guru turns ride the poll payload, not message rows (§4.1-D).
interface PendingGuru {
  guru: 'sage' | 'elder'
  name: 'Sage' | 'The Elder'
  submitted_ts: number
}

// `author` wins; legacy rows map sender 'admin' -> 'team' (§4.1-F1).
function authorOf(msg: SupportMessage): Author {
  return msg.author ?? (msg.sender === 'admin' ? 'team' : 'visitor')
}

const MAX_BODY_CHARS = 48000 // mirrors src/lib/support.js (raised 2026-11-08, handoff §4.1-E)
const CONSENT_PREVIEW_CHARS = 2000 // longer bodies get the payload-preview + consent card (§3 step 5)
const ACCOUNT_NUMBER_PATTERN = /^\d{16}$/ // Mullvad-style 16-digit account number (digits only after stripping spaces)
const GURU_AVATARS: Record<'sage' | 'elder', { src: string; mono: string }> = {
  sage: { src: '/img/brand/sage.webp', mono: 'S' },
  elder: { src: '/img/brand/the-elder.webp', mono: 'E' },
}
const STORAGE_KEY = 'rma-support'
const PILL_KEY = 'rma-support-pill'
const POLL_OPEN_MS = 4000 // handoff-suggested cadence, panel open
const POLL_CLOSED_MS = 30000 // slow heartbeat while closed — powers the unread badge
const NUDGE_AFTER_MS = 60000 // no admin reply within a minute ⇒ team is likely away
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/ // mirrors src/lib/support.js
const EMAIL_MAX_CHARS = 254
const PLACEHOLDERS = [
  'Ask about rooting your phone…',
  'Question about your account or subscription?',
  'Payment issue? We can help…',
]

function loadSession(): SupportSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SupportSession>
    if (typeof parsed.id === 'string' && typeof parsed.token === 'string') {
      return parsed as SupportSession
    }
  } catch {
    // corrupted storage — start fresh
  }
  return null
}

function saveSession(session: SupportSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// api.js returns a non-throwing { ok, status, data } envelope; the widget's
// error paths key on err.code. unwrap() bridges that: !ok throws an Error
// whose .code is the HTTP status string ('401', '429', ...) and whose
// .error/.data carry the response body's error slug and payload (Guru flows
// need 'account_not_found', 'insufficient_guru_balance', requiredUsd, ...).
interface ApiError extends Error {
  code?: string
  error?: string
  data?: { error?: string; [k: string]: unknown } | null
}

async function unwrap(p: Promise<{ ok: boolean; status: number; data: any }>): Promise<any> {
  const res = await p
  if (!res.ok) {
    const err: ApiError = new Error(res.data?.error || `HTTP ${res.status}`)
    err.code = String(res.status)
    err.error = res.data?.error
    err.data = res.data
    throw err
  }
  return res.data
}

function isApi404(err: unknown): boolean {
  return (err as ApiError)?.code === '404'
}

// ---- DOM ---------------------------------------------------------------

const root = el('div', 'support-widget')
root.hidden = true

const pill = el('button', 'support-pill', 'Questions? Chat with us')
pill.type = 'button'
try {
  pill.hidden = !!localStorage.getItem(PILL_KEY) || !!loadSession()
} catch {
  pill.hidden = false
}

const toggle = el('button', 'support-toggle')
toggle.type = 'button'
toggle.setAttribute('aria-label', 'Chat with support')
toggle.setAttribute('aria-expanded', 'false')
toggle.innerHTML =
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
const badge = el('span', 'support-badge')
badge.hidden = true
toggle.appendChild(badge)

const panel = el('section', 'support-panel')
panel.hidden = true
panel.setAttribute('aria-label', 'Support chat')

const head = el('header', 'support-head')
const headText = el('div')
headText.appendChild(el('p', 'support-title', 'Chat with the team'))
const headStatus = el('p', 'support-sub', 'Anonymous — no sign-in')
headText.appendChild(headStatus)
const closeBtn = el('button', 'support-close', '×')
closeBtn.type = 'button'
closeBtn.setAttribute('aria-label', 'Close support chat')
head.appendChild(headText)
head.appendChild(closeBtn)

const body = el('div', 'support-body')

const messagesEl = el('div', 'support-messages')
messagesEl.setAttribute('aria-live', 'polite')

const composer = el('div', 'support-composer')
const composerInput = el('textarea', 'support-input support-composer-input')
composerInput.placeholder = PLACEHOLDERS[0]
composerInput.rows = 2
composerInput.maxLength = MAX_BODY_CHARS
const sendBtn = el('button', 'btn btn-primary support-send')
sendBtn.type = 'button'
sendBtn.disabled = true
sendBtn.setAttribute('aria-label', 'Send message')
sendBtn.innerHTML =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>'
composer.appendChild(composerInput)
composer.appendChild(sendBtn)

const closedNote = el('p', 'support-note', 'This conversation is closed. ')
const newChatLink = el('button', 'support-link', 'Start a new chat')
newChatLink.type = 'button'
closedNote.appendChild(newChatLink)
closedNote.hidden = true

const rateNote = el('p', 'support-note', 'Slow down a little — message not sent. Try again in a minute.')
rateNote.hidden = true

const downNote = el('p', 'support-note')
downNote.appendChild(document.createTextNode('Support chat is unavailable right now — please email '))
const downMail = el('a', 'support-link', 'support@rootmyandroid.com')
downMail.href = 'mailto:support@rootmyandroid.com'
downNote.appendChild(downMail)
downNote.appendChild(document.createTextNode(' instead.'))
downNote.hidden = true

const staleNote = el('p', 'support-note', 'This chat session expired. ')
const staleLink = el('button', 'support-link', 'Start a new chat')
staleLink.type = 'button'
staleNote.appendChild(staleLink)
staleNote.hidden = true

const sendError = el('p', 'support-error')
sendError.hidden = true

// One-time email nudge — appears inline when no admin reply has arrived
// within NUDGE_AFTER_MS of the visitor's latest message.
const nudgeCard = el('div', 'support-nudge')
nudgeCard.hidden = true
nudgeCard.appendChild(el('p', 'support-nudge-text', 'The team looks away right now — your message is delivered and replies land here. Want to leave an email so they can reference you?'))
const nudgeRow = el('div', 'support-nudge-row')
const nudgeInput = el('input', 'support-input support-nudge-input')
nudgeInput.type = 'email'
nudgeInput.placeholder = 'you@example.com'
nudgeInput.maxLength = EMAIL_MAX_CHARS
nudgeInput.setAttribute('aria-label', 'Email address (optional)')
const nudgeSave = el('button', 'btn btn-primary btn-sm', 'Save')
nudgeSave.type = 'button'
const nudgeSkip = el('button', 'support-link', 'Not now')
nudgeSkip.type = 'button'
nudgeRow.appendChild(nudgeInput)
nudgeRow.appendChild(nudgeSave)
nudgeRow.appendChild(nudgeSkip)
nudgeCard.appendChild(nudgeRow)
const nudgeError = el('p', 'support-error')
nudgeError.hidden = true
nudgeCard.appendChild(nudgeError)

// Escalated-to-humans banner (driven by conversation.escalated, §4.1-C).
const escalatedBanner = el(
  'p',
  'support-escalated',
  'The human team has been asked to take over — Sage is muted in this conversation.',
)
escalatedBanner.hidden = true

// Action row: paid Elder escalation + human hand-off (§3 steps 3-4).
const actionRow = el('div', 'support-actions')
const elderBtn = el('button', 'support-action-btn', 'Ask The Elder · paid (beta)')
elderBtn.type = 'button'
const humanBtn = el('button', 'support-action-btn', 'Talk to a human')
humanBtn.type = 'button'
actionRow.appendChild(elderBtn)
actionRow.appendChild(humanBtn)
actionRow.hidden = true // shown once a conversation exists and is open

// Elder card: account-number entry state -> quote + consent state (§3 step 3).
const elderCard = el('div', 'support-guru-card')
elderCard.hidden = true
const elderEntry = el('div', 'support-guru-state')
elderEntry.appendChild(el('p', 'support-guru-title', 'The Elder — paid Guru answers (beta)'))
const elderEntryText = el('p', 'support-guru-text')
elderEntry.appendChild(elderEntryText)
const elderInput = el('input', 'support-input support-guru-input')
elderInput.type = 'text'
elderInput.inputMode = 'numeric'
elderInput.autocomplete = 'off'
elderInput.placeholder = '1234 5678 9012 3456'
elderInput.maxLength = 19 // 16 digits + 3 grouping spaces
elderInput.setAttribute('aria-label', '16-digit account number')
const elderEntryRow = el('div', 'support-guru-row')
const elderContinue = el('button', 'btn btn-primary btn-sm', 'Get quote')
elderContinue.type = 'button'
elderContinue.disabled = true
const elderCancel = el('button', 'support-link', 'Cancel')
elderCancel.type = 'button'
elderEntryRow.appendChild(elderContinue)
elderEntryRow.appendChild(elderCancel)
elderEntry.appendChild(elderInput)
elderEntry.appendChild(elderEntryRow)
const elderEntryError = el('p', 'support-error')
elderEntryError.hidden = true
elderEntry.appendChild(elderEntryError)
const elderQuote = el('div', 'support-guru-state')
elderQuote.appendChild(el('p', 'support-guru-title', 'The Elder (beta) — confirm charge'))
const elderQuoteText = el('p', 'support-guru-text')
elderQuote.appendChild(elderQuoteText)
const elderQuoteRow = el('div', 'support-guru-row')
const elderConfirm = el('button', 'btn btn-primary btn-sm', 'Send to The Elder')
elderConfirm.type = 'button'
const elderQuoteCancel = el('button', 'support-link', 'Cancel')
elderQuoteCancel.type = 'button'
elderQuoteRow.appendChild(elderConfirm)
elderQuoteRow.appendChild(elderQuoteCancel)
elderQuote.appendChild(elderQuoteRow)
const elderQuoteError = el('p', 'support-error')
elderQuoteError.hidden = true
elderQuote.appendChild(elderQuoteError)
const elderTopUp = el('a', 'support-link', 'Top up Guru Balance on your account page →')
elderTopUp.href = '/account'
elderTopUp.hidden = true
elderQuote.appendChild(elderTopUp)
elderCard.appendChild(elderEntry)
elderCard.appendChild(elderQuote)

// Long-payload consent card (§3 step 5): preview what will be sent, name
// the provider class, send only on explicit consent.
const consentCard = el('div', 'support-consent')
consentCard.hidden = true
const consentText = el('p', 'support-guru-text')
consentCard.appendChild(consentText)
const consentPreview = el('div', 'support-consent-preview')
consentCard.appendChild(consentPreview)
const consentRow = el('div', 'support-guru-row')
const consentSend = el('button', 'btn btn-primary btn-sm', 'Send')
consentSend.type = 'button'
const consentCancel = el('button', 'support-link', 'Cancel')
consentCancel.type = 'button'
consentRow.appendChild(consentSend)
consentRow.appendChild(consentCancel)
consentCard.appendChild(consentRow)

const view = el('div', 'support-view')
view.appendChild(messagesEl)
view.appendChild(nudgeCard)
view.appendChild(escalatedBanner)
view.appendChild(elderCard)
view.appendChild(consentCard)
view.appendChild(actionRow)
view.appendChild(composer)
view.appendChild(sendError)
view.appendChild(closedNote)
view.appendChild(rateNote)
view.appendChild(downNote)
view.appendChild(staleNote)
body.appendChild(view)
panel.appendChild(head)
panel.appendChild(body)
root.appendChild(pill)
root.appendChild(toggle)
root.appendChild(panel)
document.body.appendChild(root)
root.hidden = false

// ---- State ---------------------------------------------------------------

let session: SupportSession | null = loadSession()
let lastMessageId = 0
let lastVisitorTs = 0 // ts of newest own message — drives the email nudge
let hasTeamMessage = false // TEAM turns only — Guru turns never suppress the email nudge (ruling 2026-11-08)
let conversationStatus: 'open' | 'closed' = 'open'
let escalated = false // staff hand-off requested (conversation.escalated, §4.1-C)
let transparencyShown = false // the first-Sage-turn transparency note (§3 step 2)
let pendingGuru: PendingGuru | null = null
let pendingRowEl: HTMLElement | null = null
let elderAccountNumber: string | null = null // in-memory only, page-session "sign-in" — never persisted
let elderBusy = false
let accountLinked = false // conversation.has_account_number (copy nuance only; the number itself is still required per request, §4.1-G)
let guruSupported = true // optimistic; a 404 from any Guru endpoint hides the Guru UI (pre-BE-1 backends)
let pendingConsentBody: string | null = null // long message awaiting the payload-consent card
let pollTimer: ReturnType<typeof setTimeout> | null = null
let sending = false
let unread = 0
let placeholderIndex = 0
let greetingEl: HTMLElement | null = null

// ---- Thread rendering + polling ------------------------------------------

function updateBadge() {
  badge.hidden = unread === 0
  badge.textContent = unread > 9 ? '9+' : String(unread)
}

function showGreeting() {
  if (greetingEl || session) return
  greetingEl = el(
    'div',
    'support-msg support-msg-system',
    'Hi! Ask us anything about rooting, your account, or payments — no sign-in, no email needed.',
  )
  messagesEl.appendChild(greetingEl)
}

// Avatar + name/marker row above Guru bubbles. The image hides itself on
// error (asset not deployed yet) leaving the monogram tile as fallback.
function guruHead(author: 'sage' | 'elder', name: 'Sage' | 'The Elder') {
  const head = el('div', 'support-msg-head')
  const avatar = el('span', `support-avatar support-avatar-${author}`, GURU_AVATARS[author].mono)
  const img = el('img') as HTMLImageElement
  img.src = GURU_AVATARS[author].src
  img.alt = ''
  img.loading = 'lazy'
  img.onerror = () => {
    img.remove()
  }
  avatar.appendChild(img)
  head.appendChild(avatar)
  head.appendChild(el('span', 'support-msg-label', name))
  head.appendChild(el('span', 'support-msg-tag', author === 'sage' ? 'free · beta' : 'beta'))
  return head
}

function renderMessage(msg: SupportMessage) {
  if (greetingEl) {
    greetingEl.remove()
    greetingEl = null
  }
  const author = authorOf(msg)
  // One-line transparency note rides the FIRST Sage turn of the thread (§3 step 2).
  if (author === 'sage' && !transparencyShown) {
    transparencyShown = true
    messagesEl.appendChild(
      el(
        'div',
        'support-msg support-msg-system',
        'Sage is an AI Guru — it explains and guides; it never runs device commands.',
      ),
    )
  }
  const row = el('div', `support-msg support-msg-${author}`)
  if (author === 'sage' || author === 'elder') {
    row.appendChild(guruHead(author, msg.guru?.name ?? (author === 'sage' ? 'Sage' : 'The Elder')))
  }
  const bubble = el('div', 'support-msg-body', msg.body)
  row.appendChild(bubble)
  // Failed Guru turn: apology + free retry + human-path offer; failed paid
  // turns are NOT charged (§3.1). The retry re-POSTs .../guru — no new
  // visitor message, no double charge (§4.1-D).
  if ((author === 'sage' || author === 'elder') && msg.guru?.status === 'failed') {
    row.appendChild(
      el(
        'p',
        'support-msg-failed-note',
        author === 'sage'
          ? 'Sage could not answer that turn.'
          : 'The Elder could not answer that turn — you were not charged.',
      ),
    )
    const retryRow = el('div', 'support-retry-row')
    const retryBtn = el(
      'button',
      'support-link',
      author === 'sage' ? 'Retry — free' : 'Retry The Elder',
    )
    retryBtn.type = 'button'
    retryBtn.addEventListener('click', () => {
      void retryGuru(author, retryBtn)
    })
    retryRow.appendChild(retryBtn)
    const humanLink = el('button', 'support-link', 'Talk to a human')
    humanLink.type = 'button'
    humanLink.addEventListener('click', () => {
      void escalate()
    })
    retryRow.appendChild(humanLink)
    row.appendChild(retryRow)
  }
  // Compact receipt on completed Elder turns: the charge string verbatim,
  // straight off guru.chargeUsd (§4 — the receipt rides the message).
  if (author === 'elder' && msg.guru?.status === 'complete' && msg.guru.chargeUsd) {
    row.appendChild(
      el('p', 'support-receipt', `Charged ${msg.guru.chargeUsd} USD from Guru Balance`),
    )
  }
  const time = el('time', 'support-msg-meta')
  time.dateTime = new Date(msg.ts * 1000).toISOString()
  time.textContent = new Date(msg.ts * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
  row.appendChild(time)
  messagesEl.appendChild(row)
  messagesEl.scrollTop = messagesEl.scrollHeight
  if (author === 'team') {
    hasTeamMessage = true
    nudgeCard.hidden = true // team is here — the nudge is moot
  }
  if (author !== 'visitor') {
    // Unread badge counts team + Sage + Elder turns (ruling 2026-11-08).
    if (panel.hidden && session && msg.id > (session.seen ?? 0)) {
      unread += 1
      updateBadge()
    }
  } else if (msg.ts > lastVisitorTs) {
    lastVisitorTs = msg.ts
  }
}

function syncStatus(status: string | undefined) {
  if (status === 'open' || status === 'closed') conversationStatus = status
  const closed = conversationStatus === 'closed'
  closedNote.hidden = !closed
  composerInput.disabled = closed
  sendBtn.disabled = closed || composerInput.value.trim() === ''
  headStatus.textContent = closed ? 'Anonymous · closed' : 'Anonymous · open'
  updateActionRow()
}

// The Guru/human action row exists only on a live, open conversation, and
// only while the backend proves it speaks the Guru contract (§4.1).
function updateActionRow() {
  actionRow.hidden = !(session && conversationStatus === 'open' && guruSupported)
  elderBtn.disabled = pendingGuru !== null // one Guru turn at a time (409 guru_turn_pending)
  humanBtn.disabled = escalated
  humanBtn.textContent = escalated ? 'Escalated to the team' : 'Talk to a human'
}

function syncEscalated(flag: boolean) {
  escalated = flag
  escalatedBanner.hidden = !flag
  updateActionRow()
}

async function poll(after?: number) {
  if (!session) return
  const incremental = after !== undefined
  try {
    const data = await unwrap(
      getSupportMessages({
        conversationId: session.id,
        token: session.token,
        after,
      }),
    )
    syncStatus(data.conversation?.status)
    syncEscalated(data.conversation?.escalated === true)
    accountLinked = data.conversation?.has_account_number === true
    if (!incremental) {
      messagesEl.textContent = ''
      greetingEl = null
      pendingRowEl = null
      lastMessageId = 0
      lastVisitorTs = 0
      hasTeamMessage = false
      transparencyShown = false // re-inserted before the first Sage turn of the re-rendered history
    }
    for (const msg of (data.messages ?? []) as SupportMessage[]) {
      if (msg.id > lastMessageId) {
        renderMessage(msg)
        lastMessageId = msg.id
      }
    }
    renderPendingGuru((data.pending_guru ?? null) as PendingGuru | null)
    if (!panel.hidden) {
      session.seen = lastMessageId
      saveSession(session)
    }
    maybeShowNudge()
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === '401' || code === '404') {
      // Stale/unknown token (e.g. DB was reset) — drop it and offer a fresh start.
      clearSession()
      session = null
      stopPolling()
      staleNote.hidden = false
      nudgeCard.hidden = true
      composerInput.disabled = true
      sendBtn.disabled = true
      headStatus.textContent = 'Session expired'
    }
    // anything else: transient — the next scheduled poll retries
  }
}

function nextPollDelay(): number | null {
  if (!session || document.visibilityState !== 'visible') return null
  return panel.hidden ? POLL_CLOSED_MS : POLL_OPEN_MS
}

function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer)
  const delay = nextPollDelay()
  if (delay === null) {
    pollTimer = null
    return
  }
  pollTimer = setTimeout(() => {
    void poll(lastMessageId || undefined).then(schedulePoll)
  }, delay)
}

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
}

// ---- Email nudge ----------------------------------------------------------

function nudgeDue(): boolean {
  return !!(
    session &&
    !session.nudgeDone &&
    conversationStatus === 'open' &&
    lastVisitorTs > 0 &&
    !hasTeamMessage &&
    Date.now() / 1000 - lastVisitorTs >= NUDGE_AFTER_MS / 1000
  )
}

function maybeShowNudge() {
  if (nudgeCard.hidden && nudgeDue()) nudgeCard.hidden = false
}

// Slow tick covers "sent, then waited" without any new poll activity.
setInterval(maybeShowNudge, 10000)

function markNudgeDone() {
  nudgeCard.hidden = true
  if (session) {
    session.nudgeDone = true
    saveSession(session)
  }
}

async function saveEmail() {
  const email = nudgeInput.value.trim()
  nudgeError.hidden = true
  if (!EMAIL_PATTERN.test(email)) {
    nudgeError.textContent = 'Enter a valid email address.'
    nudgeError.hidden = false
    return
  }
  if (!session || sending) return
  sending = true
  nudgeSave.disabled = true
  try {
    // Posted into the SAME thread — the API cannot attach an email after
    // creation, and the thread is the reply channel either way.
    await postSupportMessage({
      conversationId: session.id,
      token: session.token,
      body: `My email for a reply: ${email}`,
    })
    markNudgeDone()
    nudgeInput.value = ''
    window.rmaEvent?.('support_email')
    await poll(lastMessageId || undefined)
  } catch (err) {
    nudgeError.textContent = (err as Error).message || 'Could not save — try again.'
    nudgeError.hidden = false
  } finally {
    sending = false
    nudgeSave.disabled = false
  }
}

// ---- Guru turns (Sage free / The Elder paid) + human escalation ----------
// Contract: docs/HANDOFF-2026-11-08-guru-support-chat.md §4/§4.1.

// Pending turns ride the poll payload (pending_guru), never message rows
// (§4.1-D) — render/replace a thinking row pinned to the end of the thread.
// Typical waits: Sage ~4-5 s, The Elder ~5-9 s; large logcat payloads up to
// ~2 min on Sage (§3.1) — the hint appears once the wait gets long.
function renderPendingGuru(pg: PendingGuru | null) {
  pendingGuru = pg
  if (pendingRowEl) {
    pendingRowEl.remove()
    pendingRowEl = null
  }
  updateActionRow()
  if (!pg) return
  const row = el('div', `support-msg support-msg-${pg.guru}`)
  row.appendChild(guruHead(pg.guru, pg.name))
  const waitedS = Math.max(0, Date.now() / 1000 - (pg.submitted_ts || 0))
  const hint = waitedS >= 90 ? ' — large logs can take a couple of minutes' : ''
  row.appendChild(el('div', 'support-thinking', `${pg.name} is thinking…${hint}`))
  messagesEl.appendChild(row)
  pendingRowEl = row
  messagesEl.scrollTop = messagesEl.scrollHeight
}

// A 404 from any Guru endpoint means the deployed backend predates BE-1 —
// hide the Guru UI and behave exactly like the pre-Guru widget.
function guruCapabilityLost() {
  if (!guruSupported) return
  guruSupported = false
  elderCard.hidden = true
  updateActionRow()
}

function guruErrorText(err: unknown, fallback: string): string {
  const e = err as ApiError
  if (e?.error === 'guru_turn_pending') return 'A Guru turn is already running in this conversation.'
  if (e?.error === 'conversation_closed') return 'This conversation is closed.'
  if (e?.error === 'message_too_large') {
    const max = e?.data?.maxTokens
    const cap = typeof max === 'number' ? ` (max ${max.toLocaleString()} tokens)` : ''
    return `That input is too large${cap} — trim or split the log and try again.`
  }
  if (e?.error === 'sage_turn_cap') {
    const scope = e?.data?.scope
    const resetAt = typeof e?.data?.resetAt === 'number' ? (e.data.resetAt as number) : null
    const when = resetAt
      ? new Date(resetAt * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : null
    const scopeText =
      scope === 'global'
        ? 'Sage is paused site-wide right now'
        : scope === 'visitor'
          ? 'You have reached the daily Sage limit'
          : 'This conversation has reached its Sage limit'
    return `${scopeText}${when ? ` — resets ${when}` : ''}. The Elder or a human can still help.`
  }
  return (err as Error)?.message || fallback
}

function handleGuruError(err: unknown, target: HTMLElement) {
  const e = err as ApiError
  if (e?.error === 'account_not_found') {
    target.textContent = 'Account not found — check the 16-digit number and try again. No charge was made.'
    target.hidden = false
    return
  }
  if (isApi404(err)) {
    guruCapabilityLost()
    return
  }
  if (e?.error === 'insufficient_guru_balance' || e?.code === '402') {
    const d = e?.data ?? {}
    // USD strings verbatim — never arithmetic on them (§4.1-F2).
    target.textContent = `Insufficient Guru Balance — this turn needs up to ${String(d.requiredUsd ?? '?')} USD; your balance is ${String(d.balanceUsd ?? '?')} USD.`
    target.hidden = false
    elderTopUp.hidden = false
    return
  }
  target.textContent = guruErrorText(err, 'Could not reach the Guru — try again.')
  target.hidden = false
}

// ---- Elder paid flow (§3 step 3): entry -> quote -> consent -> run -------

function showElderEntry() {
  elderCard.hidden = false
  elderEntry.hidden = false
  elderQuote.hidden = true
  elderEntryError.hidden = true
  elderTopUp.hidden = true
  elderEntryText.textContent = accountLinked
    ? 'This conversation is linked to an account. Enter its 16-digit number — The Elder is charged to that account’s Guru Balance, always quoted before anything runs.'
    : 'The Elder is pay-per-use from Guru Balance — the maximum charge is quoted before anything runs. Enter your 16-digit account number (no sign-up, no email).'
  if (elderAccountNumber) {
    elderInput.value = elderAccountNumber
    elderContinue.disabled = false
  }
  elderInput.focus()
}

function hideElderCard() {
  elderCard.hidden = true
}

async function fetchElderQuote() {
  const digits = elderInput.value.replace(/\D/g, '')
  elderEntryError.hidden = true
  if (!ACCOUNT_NUMBER_PATTERN.test(digits)) {
    elderEntryError.textContent = 'Enter the full 16-digit account number.'
    elderEntryError.hidden = false
    return
  }
  if (!session || elderBusy) return
  elderBusy = true
  elderContinue.disabled = true
  try {
    const q = await unwrap(
      postSupportGuruQuote({ conversationId: session.id, token: session.token, accountNumber: digits }),
    )
    elderAccountNumber = digits
    elderEntry.hidden = true
    elderQuote.hidden = false
    elderQuoteError.hidden = true
    const sufficient = q.sufficient === true
    elderQuoteText.textContent = sufficient
      ? `Maximum charge ${String(q.quoteUsd)} USD · Guru Balance ${String(q.balanceUsd)} USD. The quote is a cap — the receipt shows the actual charge.`
      : `Maximum charge ${String(q.quoteUsd)} USD · Guru Balance ${String(q.balanceUsd)} USD — insufficient balance. Top up first; nothing was charged.`
    elderConfirm.disabled = !sufficient
    elderTopUp.hidden = sufficient
  } catch (err) {
    handleGuruError(err, elderEntryError)
  } finally {
    elderBusy = false
    elderContinue.disabled = elderInput.value.replace(/\D/g, '').length !== 16
  }
}

async function confirmElder() {
  if (!session || !elderAccountNumber || elderBusy) return
  elderBusy = true
  elderConfirm.disabled = true
  elderQuoteError.hidden = true
  try {
    await unwrap(
      postSupportGuru({
        conversationId: session.id,
        token: session.token,
        guru: 'elder',
        accountNumber: elderAccountNumber,
      }),
    )
    window.rmaEvent?.('support_guru_ask', { guru: 'elder' })
    hideElderCard()
    await poll(lastMessageId || undefined) // picks up pending_guru
    schedulePoll()
  } catch (err) {
    handleGuruError(err, elderQuoteError)
  } finally {
    elderBusy = false
    elderConfirm.disabled = false
  }
}

// Failed-turn retry (owner ruling 2026-11-08): a re-POST replaces the
// failed job — no new visitor message, no double charge (§4.1-D).
async function retryGuru(author: 'sage' | 'elder', btn: HTMLButtonElement) {
  if (!session || elderBusy) return
  if (author === 'elder' && !elderAccountNumber) {
    showElderEntry() // the account number is required per request (§4.1-G)
    return
  }
  elderBusy = true
  btn.disabled = true
  sendError.hidden = true
  try {
    await unwrap(
      postSupportGuru({
        conversationId: session.id,
        token: session.token,
        guru: author,
        accountNumber: author === 'elder' ? (elderAccountNumber ?? undefined) : undefined,
      }),
    )
    window.rmaEvent?.('support_guru_retry', { guru: author })
    await poll(lastMessageId || undefined)
    schedulePoll()
  } catch (err) {
    handleGuruError(err, sendError)
  } finally {
    elderBusy = false
    btn.disabled = false
  }
}

// ---- Human escalation (§3 step 4, §4.1-C) ---------------------------------

async function escalate() {
  if (!session || escalated) return
  humanBtn.disabled = true
  sendError.hidden = true
  try {
    await unwrap(postSupportEscalate({ conversationId: session.id, token: session.token }))
    window.rmaEvent?.('support_escalate')
    syncEscalated(true)
    await poll(lastMessageId || undefined)
  } catch (err) {
    if (isApi404(err)) {
      // Pre-BE-1 backend: every message already lands in the staff queue.
      guruCapabilityLost()
      escalatedBanner.textContent = 'Every message in this chat goes straight to the human team.'
      escalatedBanner.hidden = false
      return
    }
    if ((err as ApiError)?.error === 'conversation_closed') syncStatus('closed')
    sendError.textContent = guruErrorText(err, 'Could not notify the team — try again.')
    sendError.hidden = false
  } finally {
    humanBtn.disabled = escalated
  }
}

// ---- Long-payload consent (§3 step 5) -------------------------------------

function showConsent(body: string) {
  pendingConsentBody = body
  consentText.textContent = guruSupported
    ? `This message is ${body.length.toLocaleString()} characters. It will be posted to your support thread and processed by Sage (cloud confidential inference). No account or email is attached.`
    : `This message is ${body.length.toLocaleString()} characters. It will be posted to your support thread.`
  consentPreview.textContent = body.length > 1200 ? `${body.slice(0, 1200)}…` : body
  consentSend.textContent = guruSupported ? 'Send to Sage & the team' : 'Send to the team'
  consentCard.hidden = false
}

function hideConsent() {
  pendingConsentBody = null
  consentCard.hidden = true
}

// ---- Send + session lifecycle --------------------------------------------

function startNewChat() {
  clearSession()
  session = null
  stopPolling()
  messagesEl.textContent = ''
  greetingEl = null
  pendingRowEl = null
  lastMessageId = 0
  lastVisitorTs = 0
  hasTeamMessage = false
  conversationStatus = 'open'
  transparencyShown = false
  pendingGuru = null
  syncEscalated(false)
  hideElderCard()
  hideConsent()
  staleNote.hidden = true
  closedNote.hidden = true
  downNote.hidden = true
  sendError.hidden = true
  nudgeCard.hidden = true
  composerInput.disabled = false
  sendBtn.disabled = true
  headStatus.textContent = 'Anonymous — no sign-in'
  showGreeting()
  composerInput.focus()
}

async function send(opts?: { consentGiven?: boolean }) {
  const body = composerInput.value.trim()
  if (!body || sending || conversationStatus === 'closed') return
  // Long payloads (e.g. a pasted logcat) go through the payload-preview +
  // consent card first (§3 step 5); its confirm button re-enters consented.
  if (!opts?.consentGiven && body.length > CONSENT_PREVIEW_CHARS) {
    showConsent(body)
    return
  }
  hideConsent()
  sending = true
  sendBtn.disabled = true
  sendError.hidden = true
  try {
    if (!session) {
      // First message creates the conversation — always anonymous realtime.
      const data = await unwrap(
        createSupportConversation({
          mode: 'realtime',
          body,
          email: undefined,
          accountNumber: undefined,
        }),
      )
      session = {
        id: data.conversation_id as string,
        token: data.token as string,
      }
      saveSession(session)
      pill.hidden = true
      try {
        localStorage.setItem(PILL_KEY, '1')
      } catch {
        // storage unavailable — pill reappears next load, harmless
      }
      window.rmaEvent?.('support_start', { mode: 'realtime' })
    } else {
      await unwrap(postSupportMessage({ conversationId: session.id, token: session.token, body }))
    }
    composerInput.value = ''
    await poll(lastMessageId || undefined)
    schedulePoll()
  } catch (err) {
    const code = (err as { code?: string }).code ?? ''
    if (code === '503' || code === 'support_not_configured') {
      downNote.hidden = false
    } else if (code === '429') {
      // Rate-limited (60 messages/conversation/day server-side): calm note, not an error.
      rateNote.hidden = false
      setTimeout(() => {
        rateNote.hidden = true
      }, 15000)
    } else if (code === '409') {
      syncStatus('closed')
      await poll(lastMessageId || undefined).catch(() => undefined)
    } else if (code === '401' || code === '404') {
      clearSession()
      session = null
      staleNote.hidden = false
      composerInput.disabled = true
    } else {
      sendError.textContent = (err as Error).message || 'Could not send — try again.'
      sendError.hidden = false
    }
  } finally {
    sending = false
    // composerInput.disabled already reflects a closed conversation (syncStatus).
    sendBtn.disabled = composerInput.disabled || composerInput.value.trim() === ''
  }
}

// ---- Panel + wiring --------------------------------------------------------

function openPanel() {
  panel.hidden = false
  toggle.setAttribute('aria-expanded', 'true')
  pill.hidden = true
  try {
    localStorage.setItem(PILL_KEY, '1')
  } catch {
    // storage unavailable — pill reappears next load, harmless
  }
  unread = 0
  updateBadge()
  updateActionRow()
  if (session) {
    session.seen = lastMessageId
    saveSession(session)
    void poll(lastMessageId || undefined)
  } else {
    showGreeting()
  }
  schedulePoll()
  composerInput.focus()
}

function closePanel() {
  panel.hidden = true
  toggle.setAttribute('aria-expanded', 'false')
  if (session) {
    session.seen = lastMessageId
    saveSession(session)
  }
  schedulePoll() // switches to the slow closed-panel heartbeat
}

toggle.addEventListener('click', () => {
  if (panel.hidden) openPanel()
  else closePanel()
})
pill.addEventListener('click', openPanel)
closeBtn.addEventListener('click', closePanel)
sendBtn.addEventListener('click', () => {
  void send()
})
newChatLink.addEventListener('click', startNewChat)
staleLink.addEventListener('click', startNewChat)
elderBtn.addEventListener('click', showElderEntry)
elderCancel.addEventListener('click', hideElderCard)
elderQuoteCancel.addEventListener('click', hideElderCard)
elderContinue.addEventListener('click', () => {
  void fetchElderQuote()
})
elderConfirm.addEventListener('click', () => {
  void confirmElder()
})
elderInput.addEventListener('input', () => {
  elderContinue.disabled = elderInput.value.replace(/\D/g, '').length !== 16
})
humanBtn.addEventListener('click', () => {
  void escalate()
})
consentSend.addEventListener('click', () => {
  if (pendingConsentBody) void send({ consentGiven: true })
})
consentCancel.addEventListener('click', hideConsent)
nudgeSave.addEventListener('click', () => {
  void saveEmail()
})
nudgeSkip.addEventListener('click', markNudgeDone)

composerInput.addEventListener('input', () => {
  sendBtn.disabled =
    conversationStatus === 'closed' || composerInput.value.trim() === ''
})
composerInput.addEventListener('keydown', (e) => {
  // Chat convention: Enter sends, Shift+Enter inserts a newline.
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void send()
  }
})

// Rotating placeholder keeps the empty composer inviting; never while typing.
setInterval(() => {
  if (panel.hidden) return
  if (composerInput.value || document.activeElement === composerInput) return
  placeholderIndex = (placeholderIndex + 1) % PLACEHOLDERS.length
  composerInput.placeholder = PLACEHOLDERS[placeholderIndex]
}, 5000)

// Poll only while the tab is visible (same pattern as src/scripts/analytics.ts).
document.addEventListener('visibilitychange', schedulePoll)

if (session) {
  schedulePoll() // heartbeat runs even before first open — powers the unread badge
} else {
  showGreeting()
}

export {}
