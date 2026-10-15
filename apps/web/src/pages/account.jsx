// src/pages/account.jsx — Mullvad-style account creation + add-time flow.
import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'

import { Button } from '@/components/Button'
import { Logo } from '@/components/Logo'
import { createAccount, createCheckout, getAccount } from '@/lib/api'

const PLANS = [
  { id: 'monthly', label: '1 month', price: '$5', days: 30 },
  { id: 'yearly', label: '12 months', price: '$50', days: 365 },
]

function Panel({ title, children }) {
  return (
    <div className="rounded-2xl bg-slate-800/50 p-6 ring-1 ring-white/10">
      <h2 className="font-display text-lg text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  )
}

export default function AccountPage() {
  const [accountNumber, setAccountNumber] = useState('')
  const [accountInfo, setAccountInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function onCreateAccount() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await createAccount()
      if (res.ok && res.data?.account_number) {
        setAccountNumber(res.data.account_number)
        setAccountInfo(res.data)
        setNotice('Save this number. It is the only way to access your account.')
      } else {
        setError(res.data?.error || 'Could not create an account. Please try again.')
      }
    } catch {
      setError('Network error. Is the API reachable?')
    } finally {
      setBusy(false)
    }
  }

  async function onLookup(e) {
    e?.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await getAccount(accountNumber)
      if (res.ok) {
        setAccountInfo(res.data)
      } else if (res.status === 404) {
        setAccountInfo(null)
        setError('Account not found. Check the number and try again.')
      } else if (res.status === 400) {
        setAccountInfo(null)
        setError('That does not look like a valid 16-digit account number.')
      } else {
        setError(res.data?.error || 'Lookup failed.')
      }
    } catch {
      setError('Network error. Is the API reachable?')
    } finally {
      setBusy(false)
    }
  }

  async function onCheckout(plan) {
    setBusy(true)
    setError('')
    try {
      const res = await createCheckout({ accountNumber, plan })
      if (res.ok && res.data?.invoice_url) {
        window.location.href = res.data.invoice_url
        return
      }
      if (res.status === 503) {
        setError('Card payments are not enabled yet. Please check back soon.')
      } else {
        setError(res.data?.error || 'Could not start checkout.')
      }
    } catch {
      setError('Network error. Is the API reachable?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="flex items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Home page">
          <Logo className="h-9 w-auto fill-slate-700 dark:fill-sky-100" />
        </Link>
        <Button href="/" variant="secondary">
          Back to docs
        </Button>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl tracking-tight text-white">
          Your account
        </h1>
        <p className="mt-2 text-slate-400">
          No email. No password. Your 16-digit account number is your account —
          keep it safe.
        </p>

        {notice && (
          <p className="mt-6 rounded-lg bg-sky-500/10 p-4 text-sm text-sky-300 ring-1 ring-sky-500/30">
            {notice}
          </p>
        )}
        {error && (
          <p className="mt-6 rounded-lg bg-amber-500/10 p-4 text-sm text-amber-300 ring-1 ring-amber-500/30">
            {error}
          </p>
        )}

        <div className="mt-8 space-y-6">
          <Panel title="Account number">
            <form onSubmit={onLookup} className="flex flex-col gap-3">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck="false"
                placeholder="1234 5678 9012 3456"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-mono text-lg tracking-widest text-white ring-1 ring-white/10 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <div className="flex gap-3">
                <Button type="submit" disabled={busy}>
                  Look up
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={onCreateAccount}
                >
                  Generate new account
                </Button>
              </div>
            </form>

            {accountInfo && (
              <dl className="mt-5 flex items-center justify-between rounded-lg bg-slate-900/60 px-4 py-3 ring-1 ring-white/5">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    Balance
                  </dt>
                  <dd className="font-display text-2xl text-white">
                    {accountInfo.credit_days}{' '}
                    <span className="text-base text-slate-400">days</span>
                  </dd>
                </div>
              </dl>
            )}
          </Panel>

          <Panel title="Add time">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  disabled={busy || !accountNumber}
                  onClick={() => onCheckout(plan.id)}
                  className={clsx(
                    'rounded-xl bg-slate-900 p-4 text-left ring-1 ring-white/10 transition',
                    accountNumber
                      ? 'hover:ring-sky-400'
                      : 'cursor-not-allowed opacity-50'
                  )}
                >
                  <div className="font-display text-xl text-white">
                    {plan.price}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">{plan.label}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {plan.days} days of service
                  </div>
                </button>
              ))}
            </div>
            {!accountNumber && (
              <p className="mt-3 text-sm text-slate-500">
                Enter or generate an account number above to add time.
              </p>
            )}
            <p className="mt-4 text-xs text-slate-500">
              Card payments are processed by our payment partner and converted
              to crypto automatically. You are redirected to a secure hosted
              checkout to complete payment.
            </p>
          </Panel>
        </div>
      </main>
    </div>
  )
}
