// Sideloading modal for the APK download buttons on /downloads (owner
// request 2026-11-13): every [data-apk-link] click is intercepted and a
// modal explains the three sideloading steps before the download starts.
//
// The modal's "Continue" is a REAL anchor carrying the same href as the
// clicked link, so the analytics auto-tracker still records the outbound
// download as an anchor click (no synthetic navigation). Explicit
// rmaEvent() calls mark the modal funnel: open / continue / cancel.
const modal = document.getElementById('sideload-modal')
const continueBtn = document.getElementById('sideload-continue') as HTMLAnchorElement | null
const cancelBtn = document.getElementById('sideload-cancel') as HTMLButtonElement | null

if (modal && continueBtn && cancelBtn) {
  const links = document.querySelectorAll<HTMLAnchorElement>('[data-apk-link]')
  let lastFocus: HTMLElement | null = null

  // Display toggling: exactly one of the two display classes is present
  // at a time (no `hidden flex` ambiguity from stylesheet ordering).
  const open = (href: string) => {
    lastFocus = document.activeElement as HTMLElement | null
    continueBtn.setAttribute('href', href)
    modal.classList.remove('hidden')
    modal.classList.add('flex')
    window.rmaEvent?.('apk_sideload_modal_open', {})
    continueBtn.focus()
  }

  const close = (reason: 'cancel' | 'escape' | 'backdrop') => {
    modal.classList.add('hidden')
    modal.classList.remove('flex')
    if (reason === 'cancel') window.rmaEvent?.('apk_sideload_cancel', {})
    lastFocus?.focus()
  }

  for (const link of links) {
    link.addEventListener('click', (e) => {
      e.preventDefault()
      open(link.href)
    })
  }

  continueBtn.addEventListener('click', () => {
    // Navigation happens through the anchor itself (analytics auto-track);
    // hide the modal so a back-navigation doesn't land on an open overlay.
    modal.classList.add('hidden')
    window.rmaEvent?.('apk_sideload_continue', {})
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
