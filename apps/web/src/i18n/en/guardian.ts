// src/i18n/en/guardian.ts — English (default locale) Guardian Angel
// product-page dictionary. Contract for zh/ru/ko (typed `typeof en`).
// Glossary from en/common.ts applies; tier names ("Guardian Angel FREE"…)
// and prices are never translated. The tier & FAQ arrays feed BOTH the
// visible markup AND the JSON-LD — structured data mirrors copy per locale.
const guardian = {
  metaTitle: 'Guardian Angel — parental device management for Android',
  metaDescription:
    'Guardian Angel is the privacy-first parental device-management app: usage stats, ad blocking, and message/call-log monitoring on Lite ($5/30 days) and Pro ($15/30 days). Client-side encrypted; AI summaries in development.',
  // SoftwareApplication JSON-LD description (mirrors the visible copy).
  schemaDescription:
    'Parental device management for your family: usage statistics, ad blocking, and message, call-log, and media monitoring for up to 5 devices — client-side encrypted, with AI activity summaries in development.',
  heroH1Before: 'Guardian Angel — ',
  heroH1Highlight: 'watch over them',
  heroH1After: ', without watching everything.',
  heroLede:
    'Guardian Angel is parental device management for your family. You install and configure it on your child\'s device yourself, and it reports back to your private account — no email, no password, and everything encrypted on the device before it leaves. AI assistance is being built to turn that activity into calm, readable summaries.',
  heroDownload: 'Download Guardian Angel',
  heroPlans: 'See plans & pricing',
  heroImgAlt:
    'Illustration of the Guardian Angel — the green Android robot with a golden halo — standing protectively beside a smartphone showing app usage statistics',
  plansH2: 'Plans that respect your family',
  plansP:
    'Start free and upgrade when you need more. Every plan is a top-up subscription: add time whenever you like — no auto-renew, no stored card — and paying with crypto saves 15%.',
  tiers: [
    {
      name: 'Guardian Angel FREE',
      price: '$0',
      per: 'forever',
      features: [
        'Short-term usage statistics of every app',
        'DNS-based ad blocker',
        'Cleanup & maintenance',
      ],
    },
    {
      name: 'Guardian Angel LITE',
      price: '$5',
      per: '30 days',
      features: [
        'Read installed apps',
        'Read messages',
        'Cover up to 5 devices',
        '30 days per top-up — add time anytime',
      ],
    },
    {
      name: 'Guardian Angel PRO',
      price: '$15',
      per: '30 days',
      features: [
        'Everything in Guardian Angel Lite',
        'Read call logs',
        'View photos & media',
        'View camera & video',
        'Switch between Lite and Pro anytime',
      ],
    },
  ],
  plansNoteBefore: 'Feature packages are being finalized — the lineup on our ',
  plansNoteLink: 'pricing page',
  plansNoteEnd: ' is the current offer.',
  encH2: 'Client-side encryption — no privacy concerns, by design',
  encPStrong: 'Everything Guardian Angel syncs is encrypted on your child\'s device before it leaves, with a key held by you and never by us.',
  encPRest:
    ' Usage statistics, messages, call logs, photos — whatever your plan covers, it arrives at our servers as ciphertext we cannot decrypt, attached to an account number that identifies no one. We cannot read your child\'s data, we cannot recover a lost key, and there is no personal profile of your child — the only records are your account number and the managed device\'s encrypted data.',
  encLi1: 'No email, no password, no name, no phone number — there is no field to enter them.',
  encLi2: 'No advertising identifiers or cross-site tracking of any kind.',
  encLi3: 'No sale, rental, or sharing of your data with anyone.',
  encLi4: 'You install and configure the app yourself; it syncs to your account number and nobody else\'s.',
  encNoteBefore: 'The full details are in our ',
  encNoteLink: 'Privacy Policy',
  encNoteEnd: ', including exactly what is stored and why.',
  aiH2: 'Guardian Angel AI',
  aiBadge: 'PLANNED',
  aiP:
    'Guardian Angel AI is on our roadmap and in development — it is not part of any plan you can buy today. Its job is to reduce noise, not to watch harder: it turns locally filtered activity into summaries a parent can actually read, and it explains itself as it goes. Your guide is the Guardian Angel itself — the green robot with the golden halo from our artwork: it watches quietly, then explains.',
  aiLi1Strong: 'App and usage categorization',
  aiLi1Rest: ' — what kind of apps fill your child\'s day.',
  aiLi2Strong: 'Duplicate-alert grouping',
  aiLi2Rest: ' — one finding instead of fifty notifications.',
  aiLi3Strong: 'Activity summaries',
  aiLi3Rest: ' — a parent-readable digest, on your schedule.',
  aiLi4Strong: 'Explanations',
  aiLi4Rest: ' — why a rule generated an alert, in plain language.',
  aiLi5Strong: 'Alert-sensitivity recommendations',
  aiLi5Rest: ' — tune the rules with reasons, not guesswork.',
  aiLi6Strong: 'Your feedback loop',
  aiLi6Rest: ' — mark anything useful, false positive, or ignore similar.',
  aiWhereH3: 'Where processing happens — labeled on every screen',
  aiWhereP: 'Every AI result carries a visible processing label so you always know where your family\'s data went:',
  aiWhereLi1Strong: 'On device',
  aiWhereLi1Rest: ' — filtering and categorization that never leaves the phone.',
  aiWhereLi2Strong: 'Cloud AI — minimized activity data',
  aiWhereLi2Rest: ' — aggregates and categories only, sent with your consent.',
  aiWhereLi3Strong: 'Cloud AI — sensitive content',
  aiWhereLi3Rest: ' — only if such processing is ever approved, and only with a separate, exact authorization for that category.',
  aiWhereLi4Strong: 'External provider — provider name',
  aiWhereLi4Rest: ' — when a third-party model is used, its name is on the label.',
  aiMediaP:
    'Media processing is disabled by default and outside the initial release. Raw messages and media are never uploaded by default — AI summaries work from locally filtered, minimized activity data.',
  aiChooseH3: 'You choose, category by category',
  aiChooseP:
    'Separate controls for separate decisions: local filtering; cloud AI summaries; message-content processing, if it is ever supported; media processing; provider and model selection where permitted; retention and deletion. Revoking cloud processing never deletes your local rules — monitoring keeps working on device, exactly as before.',
  aiNeverH3: 'What Guardian Angel AI will never do',
  aiNeverLi1: 'Make autonomous disciplinary decisions — punish, block, or contact anyone.',
  aiNeverLi2: 'Diagnose mental health or declare content "safe".',
  aiNeverLi3: 'Silently expand what is monitored.',
  aiNeverLi4: 'Guarantee safety outcomes — it informs parents; it does not replace them.',
  billH2: 'How AI usage will be billed',
  billP1:
    'Your Guardian Angel subscription time and AI usage are separate things and will stay separate: the plan, an included AI allowance, additional prepaid inference usage, and BYOK usage you pay directly to your own provider. Before the first charge you will see the feature and task, the provider and model, the estimated maximum charge, and a hard session spending cap — and the session stops cleanly at that cap.',
  billPanelStrong: 'Local tools are free. Cloud AI uses your included allowance or prepaid AI usage. No automatic overages.',
  billPanelRest: ' No overdraft, no automatic top-up, and the billing history never contains message or prompt contents.',
  builtinH2: 'Already using built-in controls?',
  builtinPBefore:
    'Guardian Angel adds the monitoring layer on top of Android\'s built-in controls and Google Family Link — it does not replace them. Our ',
  builtinLink: 'parental-controls guide',
  builtinPEnd:
    ' walks through all three layers and includes a side-by-side comparison so you can decide what your family actually needs.',
  faqH2: 'Frequently asked questions',
  faqs: [
    {
      q: 'What is Guardian Angel?',
      a: 'Guardian Angel is our parental device-management app: you install and configure it on your child\'s device yourself, and it reports back to your private account. The free tier includes short-term usage statistics of every app, a DNS-based ad blocker, and cleanup and maintenance; Lite and Pro add message, app, call-log, and media visibility for up to 5 devices.',
    },
    {
      q: 'Do I need an email or an account?',
      a: 'No email and no password — accounts are Mullvad-style random 16-digit numbers, and the number itself is the credential. Nothing about you or your child is tied to a name, an address, or a phone number.',
    },
    {
      q: 'What do the Lite and Pro plans include?',
      a: 'Lite ($5 / 30 days) reads installed apps and reads messages, covering up to 5 devices per account. Pro ($15 / 30 days) adds call logs, photos & media, and camera & video. Both are top-up subscriptions — no auto-renew, no stored card — and you can switch between Lite and Pro anytime.',
    },
    {
      q: 'Who can read my child\u2019s messages and photos?',
      a: 'Only you. Everything Guardian Angel syncs is encrypted on the device before upload, with a key held by you and never by us — we cannot decrypt your monitoring data. AI summaries, when they ship, use locally filtered and minimized activity data, and message content is only ever processed if that exact category has been separately authorized by you.',
    },
    {
      q: 'Does Guardian Angel AI make decisions about my child?',
      a: 'No. Guardian Angel AI is being built to summarize and explain — group duplicate alerts, categorize app usage, and explain why a rule fired — never to punish, block, diagnose, or contact anyone autonomously. It is a planned feature and is not part of any current plan.',
    },
    {
      q: 'Does paying with crypto save 15%?',
      a: 'Yes — 15% off the listed prices, enforced on our servers, because crypto costs us less in fees and administration. The discount is applied at checkout; the listed fiat prices above never change.',
    },
  ],
  faqDownload: 'Download Guardian Angel',
  faqPlans: 'Plans & pricing',
}

export default guardian
