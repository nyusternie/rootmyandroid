// src/scripts/account.ts — /account page logic (framework-free).
// Calls the Root My Android API (rootmyandroid.com/v1). Bundled by Astro and
// loaded as a module; the rest of the site ships zero JavaScript.
import qrcode from 'qrcode-generator'
import {
  createAccount,
  createNitroPayment,
  getAccount,
  getPaymentStatus,
  redeemCode,
} from '../lib/api.js'

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing element #${id}`)
  return el
}

const numberInput = $('account-number') as HTMLInputElement
const notice = $('notice')
const error = $('error')
const balance = $('balance')
const creditDays = $('credit-days')
const nitroFill = $('nitro-fill')
const nitroValue = $('nitro-value')
const lookupBtn = $('lookup-btn') as HTMLButtonElement
const createBtn = $('create-btn') as HTMLButtonElement
const planHint = $('plan-hint')
const planButtons = [...document.querySelectorAll('.plan')] as HTMLButtonElement[]
const redeemInput = $('redeem-code') as HTMLInputElement
const redeemBtn = $('redeem-btn') as HTMLButtonElement
const payCurrencySelect = $('pay-currency') as HTMLSelectElement
const deposit = $('deposit')
const depositAmountLine = $('deposit-amount-line')
const depositAddress = $('deposit-address')
const depositQr = $('deposit-qr') as HTMLImageElement
const depositStatus = $('deposit-status')
const depositExpiry = $('deposit-expiry')
const copyAddressBtn = $('copy-address') as HTMLButtonElement
const depositCloseBtn = $('deposit-close') as HTMLButtonElement

// Render the account's Nitro balance on the energy bar. The fill is capped
// at 100% of the base pack (100 Nitro); the number always shows the real
// balance.
function setNitroBalance(n: number): void {
  nitroValue.textContent = String(n)
  nitroFill.style.width = `${Math.max(0, Math.min(100, n))}%`
}

let busy = false

function setBusy(v: boolean): void {
  busy = v
  lookupBtn.disabled = v
  createBtn.disabled = v
  syncPlans()
}

function show(el: HTMLElement, msg: string): void {
  el.textContent = msg
  el.hidden = !msg
}

function clearMessages(): void {
  show(notice, '')
  show(error, '')
}

function accountNumber(): string {
  return numberInput.value.trim()
}

function syncPlans(): void {
  const has = accountNumber().length > 0
  planButtons.forEach((b) => (b.disabled = busy || !has))
  redeemBtn.disabled = busy || !has
  planHint.hidden = has
}

// Whitelabel checkout state: the open deposit panel's payment id and its
// status poller. Only one payment is tracked at a time; starting a new pack
// purchase replaces it.
let activePaymentId: string | null = null
let statusTimer: number | null = null

function stopStatusPolling(): void {
  if (statusTimer !== null) {
    window.clearInterval(statusTimer)
    statusTimer = null
  }
}

function closeDeposit(): void {
  stopStatusPolling()
  activePaymentId = null
  deposit.hidden = true
}

// Statuses NOWPayments reports; terminal ones stop the poller.
const TERMINAL_STATUSES = new Set(['finished', 'failed', 'refunded', 'expired'])

async function pollPaymentStatus(): Promise<void> {
  if (!activePaymentId) return
  try {
    const res = await getPaymentStatus(activePaymentId)
    const status = res.data?.payment_status
    if (!res.ok || !status) return
    if (status === 'finished') {
      depositStatus.textContent = 'Payment confirmed — Nitro credited to your account.'
      show(notice, 'Payment received — your Nitro balance has been credited.')
      stopStatusPolling()
      activePaymentId = null
      // Refresh the displayed balance from the ledger.
      const bal = await getAccount(accountNumber())
      if (bal.ok) setNitroBalance(bal.data?.nitro_balance ?? 0)
    } else if (status === 'failed' || status === 'expired' || status === 'refunded') {
      depositStatus.textContent = `Payment ${status}. No Nitro was credited.`
      stopStatusPolling()
      activePaymentId = null
    } else {
      depositStatus.textContent = `Status: ${status}…`
    }
  } catch {
    // Transient network error — keep polling.
  }
}

function showDeposit(data: {
  payment_id: string
  pay_address: string
  pay_amount: number
  pay_currency: string
  price_amount: number
  price_currency: string
  nitro: number
  expires_at: string | null
}): void {
  stopStatusPolling()
  activePaymentId = data.payment_id
  const coin = data.pay_currency.toUpperCase()
  depositAmountLine.textContent = `Send exactly ${data.pay_amount} ${coin} ($${data.price_amount} ${String(data.price_currency).toUpperCase()} → ${data.nitro} Nitro) to:`
  depositAddress.textContent = data.pay_address
  const qr = qrcode(0, 'M')
  qr.addData(data.pay_address)
  qr.make()
  depositQr.src = qr.createDataURL(6, 4)
  depositStatus.textContent = 'Waiting for payment…'
  depositExpiry.textContent = data.expires_at
    ? `This deposit address is valid until ${new Date(data.expires_at).toLocaleString()}.`
    : ''
  deposit.hidden = false
  deposit.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  statusTimer = window.setInterval(pollPaymentStatus, 15000)
}

copyAddressBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(depositAddress.textContent || '')
    copyAddressBtn.textContent = 'Copied'
    window.setTimeout(() => (copyAddressBtn.textContent = 'Copy'), 1500)
  } catch {
    show(error, 'Could not copy — select the address and copy it manually.')
  }
})

depositCloseBtn.addEventListener('click', closeDeposit)

numberInput.addEventListener('input', syncPlans)

createBtn.addEventListener('click', async () => {
  setBusy(true)
  clearMessages()
  try {
    const res = await createAccount()
    if (res.ok && res.data?.account_number) {
      numberInput.value = res.data.account_number
      creditDays.textContent = String(res.data.credit_days ?? 0)
      setNitroBalance(res.data.nitro_balance ?? 0)
      balance.hidden = false
      show(notice, 'Save this number — it is the only way to access your account.')
    } else {
      show(error, res.data?.error || 'Could not create an account. Please try again.')
    }
  } catch {
    show(error, 'Network error. Is the API reachable?')
  } finally {
    setBusy(false)
  }
})

$('lookup-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  setBusy(true)
  clearMessages()
  try {
    const res = await getAccount(accountNumber())
    if (res.ok) {
      creditDays.textContent = String(res.data.credit_days ?? 0)
      setNitroBalance(res.data.nitro_balance ?? 0)
      balance.hidden = false
    } else if (res.status === 404) {
      balance.hidden = true
      show(error, 'Account not found. Check the number and try again.')
    } else if (res.status === 400) {
      balance.hidden = true
      show(error, 'That does not look like a valid 16-digit account number.')
    } else {
      show(error, res.data?.error || 'Lookup failed.')
    }
  } catch {
    show(error, 'Network error. Is the API reachable?')
  } finally {
    setBusy(false)
  }
})

planButtons.forEach((btn) =>
  btn.addEventListener('click', async () => {
    setBusy(true)
    clearMessages()
    const pack = btn.dataset.pack || 'nitro_100'
    try {
      const res = await createNitroPayment({
        accountNumber: accountNumber(),
        pack,
        payCurrency: payCurrencySelect.value,
      })
      if (res.ok && res.data?.pay_address) {
        showDeposit(res.data)
        return
      }
      if (res.status === 503) {
        show(error, 'Checkout is temporarily unavailable. Please try again later.')
      } else {
        show(error, res.data?.error || 'Could not start checkout.')
      }
    } catch {
      show(error, 'Network error. Is the API reachable?')
    } finally {
      setBusy(false)
    }
  })
)

redeemBtn.addEventListener('click', async () => {
  setBusy(true)
  clearMessages()
  try {
    const res = await redeemCode({ accountNumber: accountNumber(), code: redeemInput.value })
    if (res.ok) {
      setNitroBalance(res.data?.nitro_balance ?? 0)
      balance.hidden = false
      redeemInput.value = ''
      show(notice, `Code redeemed — ${res.data?.redeemed} Nitro added to your account.`)
    } else if (res.status === 409) {
      show(error, 'That code has already been redeemed.')
    } else if (res.status === 404) {
      show(
        error,
        res.data?.error === 'account_not_found'
          ? 'Account not found. Check the number and try again.'
          : 'That code is not valid. Check it and try again.'
      )
    } else if (res.status === 400) {
      show(
        error,
        res.data?.error === 'invalid_code'
          ? 'That does not look like a valid code.'
          : 'That does not look like a valid 16-digit account number.'
      )
    } else {
      show(error, res.data?.error || 'Redemption failed.')
    }
  } catch {
    show(error, 'Network error. Is the API reachable?')
  } finally {
    setBusy(false)
  }
})

// Reflect ?paid=1 / ?cancelled=1 return URLs (legacy hosted-checkout flow).
const q = new URLSearchParams(location.search)
if (q.get('paid')) show(notice, 'Payment received — your balance will update shortly.')
if (q.get('cancelled')) show(error, 'Checkout cancelled. No charge was made.')

syncPlans()
