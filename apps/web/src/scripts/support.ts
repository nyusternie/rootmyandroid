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
import {
  createSupportConversation,
  getSupportMessages,
  postSupportMessage,
} from '../lib/api.js'

interface SupportSession {
  id: string
  token: string
  nudgeDone?: boolean // email nudge already saved or dismissed
  seen?: number       // highest message id the visitor has seen (unread badge)
}

interface SupportMessage {
  id: number
  sender: 'visitor' | 'admin'
  body: string
  ts: number
}

const MAX_BODY_CHARS = 2000 // mirrors src/lib/support.js
const STORAGE_KEY = 'rma-support'
const PILL_KEY = 'rma-support-pill'
const POLL_OPEN_MS = 4000 // handoff-suggested cadence, panel open
const POLL_CLOSED_MS = 30000 // slow heartbeat while closed — powers the unread badge
const NUDGE_AFTER_MS = 60000 // no admin reply within a minute ⇒ team is likely away
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/ // mirrors src/lib/support.js
const EMAIL_MAX_CHARS = 254
const PLACEHOLDERS = [
  'Ask about rooting your phone…',
  'Question about your account or Halo?',
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

const view = el('div', 'support-view')
view.appendChild(messagesEl)
view.appendChild(nudgeCard)
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
let hasAdminMessage = false
let conversationStatus: 'open' | 'closed' = 'open'
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

function renderMessage(msg: SupportMessage) {
  if (greetingEl) {
    greetingEl.remove()
    greetingEl = null
  }
  const row = el('div', `support-msg support-msg-${msg.sender}`)
  const bubble = el('div', 'support-msg-body', msg.body)
  const time = el('time', 'support-msg-meta')
  time.dateTime = new Date(msg.ts * 1000).toISOString()
  time.textContent = new Date(msg.ts * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
  row.appendChild(bubble)
  row.appendChild(time)
  messagesEl.appendChild(row)
  messagesEl.scrollTop = messagesEl.scrollHeight
  if (msg.sender === 'admin') {
    hasAdminMessage = true
    nudgeCard.hidden = true // team is here — the nudge is moot
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
}

async function poll(after?: number) {
  if (!session) return
  const incremental = after !== undefined
  try {
    const res = await getSupportMessages({
      conversationId: session.id,
      token: session.token,
      after,
    })
    syncStatus(res.data.conversation?.status)
    if (!incremental) {
      messagesEl.textContent = ''
      greetingEl = null
      lastMessageId = 0
      lastVisitorTs = 0
      hasAdminMessage = false
    }
    for (const msg of (res.data.messages ?? []) as SupportMessage[]) {
      if (msg.id > lastMessageId) {
        renderMessage(msg)
        lastMessageId = msg.id
      }
    }
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
    !hasAdminMessage &&
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

// ---- Send + session lifecycle --------------------------------------------

function startNewChat() {
  clearSession()
  session = null
  stopPolling()
  messagesEl.textContent = ''
  greetingEl = null
  lastMessageId = 0
  lastVisitorTs = 0
  hasAdminMessage = false
  conversationStatus = 'open'
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

async function send() {
  const body = composerInput.value.trim()
  if (!body || sending || conversationStatus === 'closed') return
  sending = true
  sendBtn.disabled = true
  sendError.hidden = true
  try {
    if (!session) {
      // First message creates the conversation — always anonymous realtime.
      const res = await createSupportConversation({
        mode: 'realtime',
        body,
        email: undefined,
        accountNumber: undefined,
      })
      session = {
        id: res.data.conversation_id as string,
        token: res.data.token as string,
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
      await postSupportMessage({ conversationId: session.id, token: session.token, body })
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
