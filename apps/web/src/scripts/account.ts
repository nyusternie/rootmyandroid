// src/scripts/account.ts — /account page logic (framework-free).
// Calls the Root My Android API (rootmyandroid.com/v1). Bundled by Astro and
// loaded as a module; the rest of the site ships zero JavaScript.
import { createAccount, getAccount, redeemCode } from '../lib/api.js'

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
const lookupBtn = $('lookup-btn') as HTMLButtonElement
const createBtn = $('create-btn') as HTMLButtonElement
const redeemInput = $('redeem-code') as HTMLInputElement
const redeemBtn = $('redeem-btn') as HTMLButtonElement

let busy = false

function setBusy(v: boolean): void {
  busy = v
  lookupBtn.disabled = v
  createBtn.disabled = v
  syncRedeem()
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

function syncRedeem(): void {
  redeemBtn.disabled = busy || accountNumber().length === 0
}

numberInput.addEventListener('input', syncRedeem)

createBtn.addEventListener('click', async () => {
  setBusy(true)
  clearMessages()
  try {
    const res = await createAccount()
    if (res.ok && res.data?.account_number) {
      numberInput.value = res.data.account_number
      creditDays.textContent = String(res.data.credit_days ?? 0)
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

redeemBtn.addEventListener('click', async () => {
  setBusy(true)
  clearMessages()
  try {
    const res = await redeemCode({ accountNumber: accountNumber(), code: redeemInput.value })
    if (res.ok) {
      balance.hidden = false
      redeemInput.value = ''
      show(notice, 'Code redeemed — plan time added to your account.')
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

// Deep link: ?payment=<id> forwards to the standalone invoice page, which
// rebuilds the deposit panel for an in-flight whitelabel payment.
const paymentParam = q.get('payment')
if (paymentParam) {
  location.replace(`/account/payment/${encodeURIComponent(paymentParam)}`)
}

syncRedeem()
