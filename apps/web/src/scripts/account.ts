// src/scripts/account.ts — /account page logic (framework-free).
// Calls the Root My Android API (rootmyandroid.com/v1). Bundled by Astro and
// loaded as a module; the rest of the site ships zero JavaScript.
import {
  createAccount,
  createNitroCheckout,
  createNitroCryptoCheckout,
  getAccount,
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

function selectedRail(): string {
  return (
    (document.querySelector('input[name=rail]:checked') as HTMLInputElement | null)
      ?.value || 'card'
  )
}

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
    const rail = selectedRail()
    try {
      const res =
        rail === 'crypto'
          ? await createNitroCryptoCheckout({ accountNumber: accountNumber(), pack })
          : await createNitroCheckout({ accountNumber: accountNumber(), pack })
      if (res.ok && res.data?.invoice_url) {
        window.location.href = res.data.invoice_url
        return
      }
      if (res.status === 503) {
        show(
          error,
          rail === 'crypto'
            ? 'Crypto payments are not enabled yet. Please check back soon.'
            : 'Card payments are not enabled yet. Please check back soon.'
        )
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

// Reflect ?paid=1 / ?cancelled=1 return URLs from the hosted checkout.
const q = new URLSearchParams(location.search)
if (q.get('paid')) show(notice, 'Payment received — your balance will update shortly.')
if (q.get('cancelled')) show(error, 'Checkout cancelled. No charge was made.')

syncPlans()
