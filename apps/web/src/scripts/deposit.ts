// src/scripts/deposit.ts — whitelabel deposit panel logic (framework-free).
// Shared by /account (in-page checkout) and /account/payment/<id> (standalone
// invoice page). Renders address + QR and polls the payment status every 15s.
import qrcode from 'qrcode-generator'
import { getPaymentStatus } from '../lib/api.js'

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing element #${id}`)
  return el
}

export interface DepositData {
  payment_id: string
  pay_address: string
  pay_amount: number
  pay_currency: string
  price_amount: number
  price_currency: string
  nitro?: number | null
  expires_at: string | null
}

export interface DepositHooks {
  onNotice?: (msg: string) => void
  onError?: (msg: string) => void
  // Terminal 'finished' state; pages use this to refresh a balance display.
  onFinished?: () => void | Promise<void>
}

// Statuses the payment processor reports; terminal ones stop the poller.
const TERMINAL_STATUSES = new Set(['finished', 'failed', 'refunded', 'expired'])

// Rebuild panel data from a payment-status API response. The Nitro amount is
// recovered from the order id ("<account>:<pack>").
const NITRO_BY_PACK: Record<string, number> = {
  nitro_100: 100,
  nitro_500: 500,
  nitro_1000: 1000,
}

export function depositDataFromStatus(data: Record<string, any>): DepositData | null {
  if (!data?.pay_address) return null
  const pack = String(data.order_id || '').split(':')[1]
  return {
    payment_id: String(data.payment_id),
    pay_address: data.pay_address,
    pay_amount: data.pay_amount,
    pay_currency: data.pay_currency,
    price_amount: data.price_amount,
    price_currency: data.price_currency,
    nitro: NITRO_BY_PACK[pack] ?? null,
    expires_at: data.expires_at ?? null,
  }
}

// BIP-21-style payment URIs (<scheme>:<address>?amount=<n>) so a wallet scan
// pre-fills the amount. Native coins only — token contracts (USDT, USDC)
// carry no amount semantics in a bare URI, so those keep the plain address.
const PAYMENT_URI_SCHEMES: Record<string, string> = {
  btc: 'bitcoin',
  ltc: 'litecoin',
  eth: 'ethereum',
  xmr: 'monero',
  sol: 'solana',
}

function paymentUri(data: DepositData): string {
  const scheme = PAYMENT_URI_SCHEMES[data.pay_currency.toLowerCase()]
  if (!scheme) return data.pay_address
  return `${scheme}:${data.pay_address}?amount=${data.pay_amount}`
}

export function initDepositPanel(hooks: DepositHooks = {}) {
  const deposit = $('deposit')
  const depositAmountLine = $('deposit-amount-line')
  const depositAddress = $('deposit-address')
  const depositQr = $('deposit-qr') as HTMLImageElement
  const depositStatus = $('deposit-status')
  const depositExpiry = $('deposit-expiry')
  const copyAddressBtn = $('copy-address') as HTMLButtonElement
  const depositCloseBtn = $('deposit-close') as HTMLButtonElement

  // Checkout state: the open deposit panel's payment id and its status
  // poller. Only one payment is tracked at a time; showing a new deposit
  // replaces it.
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

  async function pollPaymentStatus(): Promise<void> {
    if (!activePaymentId) return
    try {
      const res = await getPaymentStatus(activePaymentId)
      const status = res.data?.payment_status
      if (!res.ok || !status) return
      if (status === 'finished') {
        depositStatus.textContent = 'Payment confirmed — Nitro credited to your account.'
        hooks.onNotice?.('Payment received — your Nitro balance has been credited.')
        stopStatusPolling()
        activePaymentId = null
        await hooks.onFinished?.()
      } else if (TERMINAL_STATUSES.has(status)) {
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

  function showDeposit(data: DepositData): void {
    stopStatusPolling()
    activePaymentId = data.payment_id
    const coin = data.pay_currency.toUpperCase()
    const nitroPart = data.nitro ? ` → ${data.nitro} Nitro` : ''
    depositAmountLine.textContent = `Send exactly ${data.pay_amount} ${coin} ($${data.price_amount} ${String(data.price_currency).toUpperCase()}${nitroPart}) to:`
    depositAddress.textContent = data.pay_address
    const qr = qrcode(0, 'M')
    qr.addData(paymentUri(data))
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
      hooks.onError?.('Could not copy — select the address and copy it manually.')
    }
  })

  depositCloseBtn.addEventListener('click', closeDeposit)

  return { showDeposit, closeDeposit, pollPaymentStatus }
}
