// src/scripts/downloads.ts — sideloading modal for the APK download buttons
// on /downloads (owner request 2026-11-13): every [data-apk-link] click is
// intercepted and a modal explains the three sideloading steps before the
// download starts.
//
// The modal's "Continue" is a REAL anchor carrying the same href as the
// clicked link, so navigation still happens through a plain anchor click.
//
// Per-APK tracking (owner request 2026-11-24, three separate APKs):
//   - the card/hero buttons carry static data-rma-event="apk_download_click"
//     + data-rma-event-detail="<app slug>" (analytics.ts per-element binding)
//   - this module sets the modal label from data-apk-name and the Continue
//     anchor's data-rma-event-detail to "<app slug>/<file>", so the anchor's
//     static data-rma-event="download" lands in the dashboard's existing
//     "top downloaded files" breakdown (name='download', detail=app/file).
//     The NAME must stay static: analytics.ts binds [data-rma-event] once at
//     load and the delegated listener skips elements that carry it, so a
//     runtime-added name would be recorded by neither path.
//   - the modal funnel events carry { app } so opens/cancels are attributable
//     to a product too.
const modal = document.getElementById('sideload-modal')
const continueBtn = document.getElementById('sideload-continue') as HTMLAnchorElement | null
const cancelBtn = document.getElementById('sideload-cancel') as HTMLButtonElement | null
const appLabel = document.getElementById('sideload-app')

if (modal && continueBtn && cancelBtn) {
  const links = document.querySelectorAll<HTMLAnchorElement>('[data-apk-link]')
  let lastFocus: HTMLElement | null = null
  let currentApp = ''

  // Display toggling: exactly one of the two display classes is present
  // at a time (no `hidden flex` ambiguity from stylesheet ordering).
  const open = (link: HTMLAnchorElement) => {
    // Slug (data-rma-event-detail) joins the funnel with apk_download_click;
    // data-apk-name is the product name shown in the modal chip.
    const app = link.dataset.rmaEventDetail ?? ''
    const file = link.dataset.apkFile ?? ''
    lastFocus = document.activeElement as HTMLElement | null
    currentApp = app
    continueBtn.setAttribute('href', link.href)
    // "<app>/<file>" keeps the dashboard's per-file breakdown unambiguous
    // (app-release.apk alone does not name the product).
    continueBtn.dataset.rmaEventDetail = app && file ? `${app}/${file}` : file
    if (appLabel) appLabel.textContent = link.dataset.apkName ?? ''
    modal.classList.remove('hidden')
    modal.classList.add('flex')
    window.rmaEvent?.('apk_sideload_modal_open', { app })
    continueBtn.focus()
  }

  const close = (reason: 'cancel' | 'escape' | 'backdrop') => {
    modal.classList.add('hidden')
    modal.classList.remove('flex')
    if (reason === 'cancel') window.rmaEvent?.('apk_sideload_cancel', { app: currentApp })
    lastFocus?.focus()
  }

  for (const link of links) {
    link.addEventListener('click', (e) => {
      e.preventDefault()
      open(link)
    })
  }

  continueBtn.addEventListener('click', () => {
    // Navigation happens through the anchor itself (the static
    // data-rma-event="download" fires via analytics.ts); hide the modal so
    // a back-navigation doesn't land on an open overlay.
    modal.classList.add('hidden')
    window.rmaEvent?.('apk_sideload_continue', { app: currentApp })
  })

  cancelBtn.addEventListener('click', () => close('cancel'))

  modal.addEventListener('click', (e) => {
    // Backdrop is the modal root itself; clicks inside the panel bubble
    // from the panel element, which we exclude here.
    if (e.target === modal) close('backdrop')
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close('escape')
  })
}
