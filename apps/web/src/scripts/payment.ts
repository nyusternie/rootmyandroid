// src/scripts/payment.ts — /account/payment/<id> standalone invoice page.
// The Pages _redirects file rewrites /account/payment/* to this page, so the
// payment id comes from the URL path (a ?payment=<id> query also works).
import { getPaymentStatus } from '../lib/api.js'
import { depositDataFromStatus, initDepositPanel } from './deposit.js'

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing element #${id}`)
  return el
}

const notice = $('notice')
const error = $('error')
const loading = $('loading')

function show(el: HTMLElement, msg: string): void {
  el.textContent = msg
  el.hidden = !msg
}

const depositPanel = initDepositPanel({
  onNotice: (msg) => show(notice, msg),
  onError: (msg) => show(error, msg),
})

// Payment id from the path (/account/payment/<id>) or, as a fallback, from
// the query string (?payment=<id>).
const pathMatch = location.pathname.match(/\/account\/payment\/([^/]+)/)
const paymentId =
  pathMatch?.[1] || new URLSearchParams(location.search).get('payment') || ''

if (!paymentId) {
  loading.textContent = ''
  show(error, 'No payment id in this link. Start a new checkout from your account page.')
} else {
  getPaymentStatus(paymentId)
    .then((res) => {
      loading.textContent = ''
      const data = res.ok ? depositDataFromStatus(res.data) : null
      if (data) {
        depositPanel.showDeposit(data)
        // Surface the current status immediately rather than waiting 15s.
        depositPanel.pollPaymentStatus()
      } else if (res.status === 400) {
        show(error, 'That does not look like a valid payment id.')
      } else {
        show(error, 'Could not load that payment. It may have expired.')
      }
    })
    .catch(() => {
      loading.textContent = ''
      show(error, 'Network error. Is the API reachable?')
    })
}
