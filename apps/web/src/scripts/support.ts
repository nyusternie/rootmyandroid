// src/scripts/support.ts — visitor support widget (framework-free): a
// floating chat button bottom-right on the app pages, opening a panel with
// BOTH support modes the API offers (handoff 2026-11-03; wire contract and
// token model verified against rootmyandroid-api src/lib/support.js):
//   1. 'realtime' — anonymous live chat, no email asked.
//   2. 'message'  — async thread; requires an email address (stored
//      UNVERIFIED — the thread here is the reply channel).
// Anonymous by design: no sign-in, no cookies. Identity is a 64-hex bearer
// token returned ONCE at creation; the widget keeps {id, token, mode} in
// localStorage['rma-support'] and presents the token as x-support-token.
// Safety: every message body renders via textContent (never innerHTML);
// white-space: pre-wrap preserves multi-line bodies (see global.css).
import {
  createSupportConversation,
  getSupportMessages,
  postSupportMessage,
} from '../lib/api.js'

type SupportMode = 'realtime' | 'message'

interface SupportSession {
  id: string
  token: string
  mode: SupportMode
}

interface SupportMessage {
  id: number
  sender: 'visitor' | 'admin'
  body: string
  ts: number
}

// Contract constants (rootmyandroid-api src/lib/support.js — keep in sync):
const MAX_BODY_CHARS = 2000 // server hard-caps (silently truncates) at 2000
const STORAGE_KEY = 'rma-support'
const POLL_MS = 4000 // handoff-suggested cadence, only while the panel is open
// Mirrors the server-side checks so obvious mistakes never hit the network:
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX_CHARS = 254

// ---------------------------------------------------------------------------
// Session persistence. The token is unrecoverable once site data is cleared
// (only its SHA-256 hash is stored server-side) — the UI copy says so.
// ---------------------------------------------------------------------------

function loadSession(): SupportSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SupportSession>
    if (
      typeof parsed.id === 'string' &&
      typeof parsed.token === 'string' &&
      (parsed.mode === 'realtime' || parsed.mode === 'message')
    ) {
      return { id: parsed.id, token: parsed.token, mode: parsed.mode }
    }
  } catch {
    // Corrupt/unreadable storage — treat as no session.
  }
  return null
}

function saveSession(session: SupportSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Storage full/blocked: the conversation still works until the tab closes.
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore.
  }
}

// ---------------------------------------------------------------------------
// DOM. Everything is built here (createElement/textContent only) so the four
// host pages need no markup of their own. Styles live in global.css under
// .support-widget (scoped like the .audit block).
// ---------------------------------------------------------------------------

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

const root = el('div', 'support-widget')

const toggle = el('button', 'support-toggle') as HTMLButtonElement
toggle.type = 'button'
toggle.setAttribute('aria-label', 'Chat with support')
toggle.setAttribute('aria-expanded', 'false')
// Chat-bubble icon, same stroke style as the header logo.
toggle.innerHTML =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<path d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v6a3.5 3.5 0 0 1-3.5 3.5H12l-4.6 3.9c-.5.4-1.4.1-1.4-.6v-3.3A3.5 3.5 0 0 1 4 12.5v-6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M8.5 8h7M8.5 11.5h4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
  '</svg>'

const panel = el('div', 'support-panel') as HTMLDivElement
panel.hidden = true
panel.setAttribute('role', 'dialog')
panel.setAttribute('aria-label', 'Support')

const head = el('div', 'support-head')
const headTitle = el('span', 'support-title', 'Support')
const headStatus = el('span', 'support-sub')
const closeBtn = el('button', 'support-close', '×') as HTMLButtonElement
closeBtn.type = 'button'
closeBtn.setAttribute('aria-label', 'Close support panel')
head.append(headTitle, headStatus, closeBtn)

const body = el('div', 'support-body')
panel.append(head, body)
root.append(toggle, panel)
document.body.append(root)

// ---------------------------------------------------------------------------
// Views (one visible at a time): chooser -> form -> thread.
// ---------------------------------------------------------------------------

const chooserView = el('div', 'support-view')
const formView = el('div', 'support-view')
const threadView = el('div', 'support-view')
body.append(chooserView, formView, threadView)

function showView(view: HTMLElement): void {
  for (const v of [chooserView, formView, threadView]) v.hidden = v !== view
}

// --- Chooser ---------------------------------------------------------------

chooserView.append(
  el(
    'p',
    'support-note',
    'Questions about rooting, your account, or a payment? Talk to the team — no sign-in, no cookies.',
  ),
)
const pickRealtime = el('button', 'support-pick') as HTMLButtonElement
pickRealtime.type = 'button'
pickRealtime.append(
  el('span', 'support-pick-title', 'Chat live'),
  el(
    'span',
    'support-pick-desc',
    'Live back-and-forth while the team is around. No email asked.',
  ),
)
const pickMessage = el('button', 'support-pick') as HTMLButtonElement
pickMessage.type = 'button'
pickMessage.append(
  el('span', 'support-pick-title', 'Leave a message'),
  el(
    'span',
    'support-pick-desc',
    "Async thread — the team's reply lands here. Requires an email address.",
  ),
)
chooserView.append(pickRealtime, pickMessage)
chooserView.append(
  el(
    'p',
    'support-note support-note-faint',
    'Anonymous: your conversation lives only in this browser’s storage. Keep this browser (and don’t clear site data) to continue the conversation.',
  ),
)

// --- Start form -------------------------------------------------------------

const formError = el('p', 'support-error')
formError.hidden = true
const formHeading = el('p', 'support-note')
const messageInput = el('textarea', 'support-input') as HTMLTextAreaElement
messageInput.maxLength = MAX_BODY_CHARS // matches the server cap + admin console
messageInput.rows = 4
messageInput.placeholder = 'Describe your question or problem…'
messageInput.required = true
const emailInput = el('input', 'support-input') as HTMLInputElement
emailInput.type = 'email'
emailInput.maxLength = EMAIL_MAX_CHARS
emailInput.placeholder = 'Email address (required)'
const emailNote = el(
  'p',
  'support-note support-note-faint',
  'Stored unverified, for the team’s reference — replies appear in this thread, not by email.',
)
const accountInput = el('input', 'support-input') as HTMLInputElement
accountInput.type = 'text'
accountInput.inputMode = 'numeric'
accountInput.autocomplete = 'off'
accountInput.placeholder = 'Account number (optional — 16 digits)'
const accountNote = el(
  'p',
  'support-note support-note-faint',
  'If your question is about a paid account. Format-checked only.',
)
const startBtn = el('button', 'btn btn-primary support-send', 'Start conversation') as HTMLButtonElement
startBtn.type = 'button'
const backBtn = el('button', 'support-link', '← back') as HTMLButtonElement
backBtn.type = 'button'
formView.append(formHeading, messageInput, emailInput, emailNote, accountInput, accountNote, formError, startBtn, backBtn)

// --- Thread -----------------------------------------------------------------

const threadInfo = el(
  'p',
  'support-note support-note-faint',
  'Keep this browser to continue the conversation — clearing site data loses the thread.',
)
const messagesEl = el('div', 'support-messages')
const closedNote = el(
  'p',
  'support-note support-note-warn',
  'This conversation was closed by the team.',
)
closedNote.hidden = true
const rateNote = el(
  'p',
  'support-note support-note-warn',
  'Message limit reached for today — please try again tomorrow.',
)
rateNote.hidden = true
const threadError = el('p', 'support-error')
threadError.hidden = true
const composerInput = el('textarea', 'support-input') as HTMLTextAreaElement
composerInput.maxLength = MAX_BODY_CHARS
composerInput.rows = 3
composerInput.placeholder = 'Write a reply…'
const sendBtn = el('button', 'btn btn-primary support-send', 'Send') as HTMLButtonElement
sendBtn.type = 'button'
const newBtn = el('button', 'support-link', 'Start a new conversation') as HTMLButtonElement
newBtn.type = 'button'
newBtn.hidden = true
threadView.append(threadInfo, messagesEl, closedNote, rateNote, threadError, composerInput, sendBtn, newBtn)

// ---------------------------------------------------------------------------
// State + polling (every 4 s while the panel is open AND the tab is visible;
// pauses on visibilitychange — the pattern analytics.ts uses for visible
// time).
// ---------------------------------------------------------------------------

let session: SupportSession | null = loadSession()
let lastMessageId = 0
let conversationStatus: 'open' | 'closed' = 'open'
let pollTimer: number | undefined
let sending = false

function stopPolling(): void {
  if (pollTimer !== undefined) {
    clearTimeout(pollTimer)
    pollTimer = undefined
  }
}

function schedulePoll(): void {
  stopPolling()
  pollTimer = window.setTimeout(() => {
    void poll()
  }, POLL_MS)
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Bodies are arbitrary visitor/admin input: textContent only, never
// innerHTML. pre-wrap (CSS) keeps the multi-line formatting.
function renderMessage(msg: SupportMessage): void {
  const row = el('div', `support-msg support-msg-${msg.sender}`)
  row.append(
    el('div', 'support-msg-body', msg.body),
    el(
      'div',
      'support-msg-meta',
      `${msg.sender === 'visitor' ? 'You' : 'Team'} · ${formatTime(msg.ts)}`,
    ),
  )
  messagesEl.append(row)
  lastMessageId = Math.max(lastMessageId, msg.id)
  messagesEl.scrollTop = messagesEl.scrollHeight
}

function setThreadError(msg: string): void {
  threadError.textContent = msg
  threadError.hidden = !msg
}

function syncThreadState(): void {
  const closed = conversationStatus === 'closed'
  closedNote.hidden = !closed
  composerInput.disabled = closed
  sendBtn.disabled = closed || sending
  newBtn.hidden = !closed && session !== null
  headStatus.textContent = session
    ? `${session.mode === 'realtime' ? 'Live chat' : 'Message thread'} · ${closed ? 'closed' : 'open'}`
    : ''
}

// The stored id+token pair no longer authenticates (401) or the conversation
// is gone (404): offer starting a new one (handoff-specified handling).
function handleStaleSession(): void {
  clearSession()
  session = null
  stopPolling()
  syncThreadState()
  messagesEl.textContent = ''
  threadInfo.textContent =
    'Your previous conversation can’t be reopened (its token is no longer valid — cleared site data loses it). Start a new one below.'
  newBtn.hidden = false
  sendBtn.disabled = true
  composerInput.disabled = true
}

async function poll(): Promise<void> {
  if (!session || panel.hidden) return
  if (document.visibilityState !== 'visible') return // resumed by visibilitychange
  try {
    const res = await getSupportMessages({
      conversationId: session.id,
      token: session.token,
      after: lastMessageId || undefined, // omitted/0 = full history (resume)
    })
    if (res.ok && res.data) {
      for (const msg of res.data.messages as SupportMessage[]) renderMessage(msg)
      const status = res.data.conversation?.status
      if (status === 'closed' || status === 'open') {
        conversationStatus = status
        syncThreadState()
      }
      setThreadError('')
    } else if (res.status === 401 || res.status === 404) {
      handleStaleSession()
      return
    } else if (res.status === 503) {
      setThreadError('Support is temporarily unavailable — please try again later.')
    } else {
      setThreadError('Couldn’t load messages. Retrying…')
    }
  } catch {
    setThreadError('Network error. Retrying…')
  }
  if (session && !panel.hidden) schedulePoll()
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session && !panel.hidden) {
    void poll() // poll() re-arms the 4 s cadence
  }
})

// ---------------------------------------------------------------------------
// Actions.
// ---------------------------------------------------------------------------

function openPanel(): void {
  panel.hidden = false
  toggle.setAttribute('aria-expanded', 'true')
  if (session) {
    // Resume: full history (omit `after`), then fall into the 4 s cadence.
    showView(threadView)
    syncThreadState()
    void poll()
  } else {
    showView(chooserView)
    headStatus.textContent = ''
  }
}

function closePanel(): void {
  panel.hidden = true
  toggle.setAttribute('aria-expanded', 'false')
  stopPolling()
}

toggle.addEventListener('click', () => {
  if (panel.hidden) openPanel()
  else closePanel()
})
closeBtn.addEventListener('click', closePanel)

let pickedMode: SupportMode = 'realtime'

function openForm(mode: SupportMode): void {
  pickedMode = mode
  formHeading.textContent =
    mode === 'realtime'
      ? 'Live chat — no email asked. Type your first message:'
      : 'Leave a message — the team’s reply lands in this thread:'
  emailInput.hidden = mode !== 'message'
  emailNote.hidden = mode !== 'message'
  formError.hidden = true
  showView(formView)
  messageInput.focus()
}

pickRealtime.addEventListener('click', () => openForm('realtime'))
pickMessage.addEventListener('click', () => openForm('message'))
backBtn.addEventListener('click', () => showView(chooserView))

function setFormError(msg: string): void {
  formError.textContent = msg
  formError.hidden = !msg
}

startBtn.addEventListener('click', () => {
  const firstBody = messageInput.value.trim()
  if (!firstBody) {
    setFormError('Type a message first.')
    return
  }
  let email: string | undefined
  if (pickedMode === 'message') {
    const candidate = emailInput.value.trim()
    if (
      !candidate ||
      candidate.length > EMAIL_MAX_CHARS ||
      !EMAIL_PATTERN.test(candidate)
    ) {
      setFormError('A valid email address is required to leave a message.')
      return
    }
    email = candidate
  }
  // Optional, format-checked only (16 digits after stripping non-digits —
  // the server does no existence check).
  const accountDigits = accountInput.value.replace(/[^0-9]/g, '')
  if (accountInput.value.trim() && accountDigits.length !== 16) {
    setFormError('Account numbers are 16 digits.')
    return
  }
  const accountNumber = accountDigits || undefined

  startBtn.disabled = true
  setFormError('')
  createSupportConversation({
    mode: pickedMode,
    body: firstBody,
    email,
    accountNumber,
  })
    .then((res) => {
      startBtn.disabled = false
      if (res.ok && res.data?.conversation_id && res.data?.token) {
        session = {
          id: res.data.conversation_id,
          token: res.data.token,
          mode: res.data.mode === 'message' ? 'message' : 'realtime',
        }
        saveSession(session)
        conversationStatus = 'open'
        lastMessageId = 0
        messagesEl.textContent = ''
        if (res.data.message) renderMessage(res.data.message as SupportMessage)
        messageInput.value = ''
        window.rmaEvent?.('support_start', { mode: session.mode })
        showView(threadView)
        syncThreadState()
        schedulePoll()
        return
      }
      const err = res.data?.error
      if (res.status === 503 || err === 'support_not_configured') {
        setFormError(
          'Support is temporarily unavailable — please try again later, or email support@rootmyandroid.com.',
        )
      } else if (res.status === 429) {
        setFormError(
          'You’ve started several conversations today — please continue an existing one or try again tomorrow.',
        )
      } else if (err === 'invalid_email') {
        setFormError('That email address doesn’t look right.')
      } else if (err === 'invalid_account_number') {
        setFormError('Account numbers are 16 digits.')
      } else {
        setFormError('Couldn’t start the conversation. Please try again.')
      }
    })
    .catch(() => {
      startBtn.disabled = false
      setFormError('Network error. Is the API reachable?')
    })
})

sendBtn.addEventListener('click', () => {
  if (!session || sending || conversationStatus === 'closed') return
  const text = composerInput.value.trim()
  if (!text) return
  sending = true
  syncThreadState()
  setThreadError('')
  postSupportMessage({ conversationId: session.id, token: session.token, body: text })
    .then((res) => {
      sending = false
      if (res.ok && res.data?.message) {
        composerInput.value = ''
        rateNote.hidden = true
        renderMessage(res.data.message as SupportMessage)
      } else if (res.status === 409) {
        conversationStatus = 'closed'
      } else if (res.status === 429) {
        rateNote.hidden = false // calm "slow down" state, not an error dump
      } else if (res.status === 401 || res.status === 404) {
        sending = false
        handleStaleSession()
        return
      } else if (res.status === 503) {
        setThreadError('Support is temporarily unavailable — please try again later.')
      } else {
        setThreadError('Message not sent. Please try again.')
      }
      syncThreadState()
    })
    .catch(() => {
      sending = false
      syncThreadState()
      setThreadError('Network error. Message not sent.')
    })
})

// Ctrl/Cmd+Enter sends (plain Enter stays a newline — bodies are multi-line).
composerInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    sendBtn.click()
  }
})

newBtn.addEventListener('click', () => {
  clearSession()
  session = null
  conversationStatus = 'open'
  lastMessageId = 0
  sending = false
  messagesEl.textContent = ''
  threadInfo.textContent =
    'Keep this browser to continue the conversation — clearing site data loses the thread.'
  closedNote.hidden = true
  rateNote.hidden = true
  setThreadError('')
  newBtn.hidden = true
  composerInput.disabled = false
  sendBtn.disabled = false
  syncThreadState()
  showView(chooserView)
})

// This file has side effects only; force module scope.
export {}
