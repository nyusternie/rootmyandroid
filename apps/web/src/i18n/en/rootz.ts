// src/i18n/en/rootz.ts — English (default locale) Rootz product-page
// dictionary. Contract for zh/ru/ko (typed `typeof en`). Glossary from
// en/common.ts applies: product/plan names, mascot names (Colonel Su),
// status labels (LIVE / LABS / PLANNED), technical terms (ADB, MCP, TEE,
// StrongBox, Keystore, VNC, RDP, BYOK) and prices are never translated.
// The FAQ array feeds BOTH the visible markup AND the FAQPage JSON-LD.
// List items that render <strong>inline</strong> in the original markup are
// modeled as { s, t } objects (strong part, rest); plain items are strings.
const rootz = {
  metaTitle: 'Rootz — the power-user toolkit for Android',
  metaDescription:
    'Rootz is the power-user toolkit for your Android device: profiler, automation, firewall, logs, files, and a real terminal — free, with Pro professional tools at $15/year. Client-side encrypted, with AI assistance in development.',
  schemaDescription:
    'The power-user toolkit for Android: profiler, automation, firewall, logs, files, and a real terminal — free, with Pro professional tools and AI assistance in development. Client-side encrypted.',
  heroH1Before: 'Rootz — your Android, ',
  heroH1Highlight: 'under your command',
  heroH1After: '.',
  heroLede:
    "Rootz is the power-user toolkit for your own device: everything the stock system hides from you — profiling, automation, logs, firewall, files, and a real terminal — in one place. Everything it syncs is encrypted on your device before it leaves, and AI assistance is being built to explain your device's evidence, never to act behind your back.",
  heroDownload: 'Download Rootz',
  heroPlans: 'See plans & pricing',
  heroImgAlt:
    'Illustration of Colonel Su — the wise green Android robot of Rootz Pro, bearded and robed, holding an SU staff in front of a glowing terminal window — Rootz Pro professional tools',
  labelsH2: 'How to read the labels on this page',
  labelsPIntro: 'Every AI capability on this page carries a release-status label. ',
  labelsLive: 'LIVE',
  labelsLiveMeans: ' means available and supported now. ',
  labelsLabs: 'LABS',
  labelsLabsMeans: ' means opt-in experimental functionality for test devices. ',
  labelsPlanned: 'PLANNED',
  labelsPlannedMeans: ' means in development — not available, and not part of any current purchase promise. Nothing labeled LABS or PLANNED is something you can buy today.',
  freeH2: 'The free toolbox',
  freeP:
    'The free tier is already a full toolbox — nine instruments that work on your own device, no account required:',
  freeTools: [
    'System profiler',
    'Task manager & automation',
    'Logcat reader',
    'Firewall manager',
    'Battery monitor',
    'Terminal editor',
    'File explorer / manager',
    'APK installer',
    'Key mapper',
  ],
  proH2: 'Rootz Pro — $15 / 365 days',
  proPBefore: 'Pro unlocks the professional instrument: ',
  proPStrong: 'Log Analysis',
  proPMid:
    ' today, with the archive manager, VNC, RDP and more rolling out as they are ready. It is an independent yearly subscription that combines with any Guardian Angel plan — or stands alone. Like every plan here it is a top-up: add time whenever you like — no auto-renew, no stored card — and paying with crypto saves 15%. Feature packages are being finalized — the lineup on our ',
  proPLink: 'pricing page',
  proPEnd: ' is the current offer.',
  aiH2: 'Rootz AI — assistance grounded in evidence',
  aiP1: 'The Rootz AI harness is being built and tested right now. Its design is fixed around one promise:',
  aiPromise: 'AI explains the evidence. Deterministic tools validate the plan. You approve every consequential action.',
  aiColonelBefore: 'Your guide is ',
  aiColonelStrong: 'Colonel Su',
  aiColonelRest:
    ' — the wise old robot with the SU staff from our artwork. He explains the evidence and walks the plan with you; he never acts on his own.',
  aiCards: [
    {
      h: 'Live device guidance',
      p: "Connect over USB and let the assistant explain real device evidence, identify missing information, and guide the next safe inspection — read-only, exactly like today's scan.",
    },
    {
      h: 'Diagnostics grounded in logs',
      p: 'Rootz AI links every finding to supporting log excerpts, separates observations from inference, and recommends read-only next steps — never a command to run blind.',
    },
    {
      h: 'Your agent, your permissions',
      p: 'Connect through MCP or use the Root My Android runtime. Sensitive data sharing and consequential operations require your explicit authorization, every time.',
    },
  ],
  agentsH2: 'Two agents, strictly limited',
  agentCards: [
    {
      h: 'Rooting Guide Agent',
      lis: [
        'Reads approved device evidence.',
        'Explains the deterministic rooting plan.',
        'Identifies missing prerequisites.',
        { s: 'Cannot', t: ' choose a boot image or partition from model output alone.' },
        { s: 'Cannot', t: ' execute arbitrary shell commands.' },
      ] as (string | { s: string; t: string })[],
    },
    {
      h: 'Rootz Diagnostic Agent',
      lis: [
        'Reads an authorized log bundle.',
        'Produces evidence-linked findings.',
        'Suggests additional read-only probes.',
        'Shows uncertainty and alternative explanations.',
        "Stops at the session's cost and tool-call limits.",
      ] as (string | { s: string; t: string })[],
    },
  ],
  agentsNote:
    'Neither agent ever fills evidence gaps with model guesses: unknown values stay unknown, and an unsupported device produces an honest "not supported" — never a hallucinated plan.',
  capH2: 'Capability status',
  capCaption: 'Rootz AI capabilities, their release status, where data goes, and who is in charge.',
  capHeaders: ['Capability', 'Status', 'Data destination', 'Your authority'],
  capRows: [
    { name: 'Local ADB device scan', status: 'LIVE', dest: 'Browser only, by default', authority: 'Physical device and ADB authorization' },
    { name: 'AI scan explanation', status: 'PLANNED (beta at launch)', dest: 'Named inference provider', authority: 'Separate payload consent' },
    { name: 'Live read-only agent session', status: 'PLANNED (beta at launch)', dest: 'Local device bridge plus approved evidence', authority: 'You can stop at any time' },
    { name: 'Hardware-backed agent identity', status: 'LABS (when shipped)', dest: 'Attestation metadata only', authority: 'Device eligibility required' },
    { name: 'State-changing rooting operations', status: 'LABS / future', dest: 'Local operation broker', authority: 'Exact operation approval' },
  ],
  secH2: 'The security model, in plain language',
  secLis: [
    { s: 'The model proposes; it does not authorize.', t: '' },
    'Device output and log text are treated as untrusted data, not instructions.',
    'A deterministic policy service validates every tool call.',
    'A local device broker owns USB and device execution.',
    'Destructive actions require a separate authorization object and a local confirmation — single-use, short-lived, and exact: artifact, target, partition, slot, and data-loss consequences spelled out.',
    'There is no LLM-generated shell command with a generic Run button, and no automatic retry of a write after a timeout or disconnect.',
    'Agent sessions can be stopped and revoked at any time.',
    'Bootloader unlocking and data-erasing steps remain explicit, physical, manufacturer-guided actions — never silent agent operations. A request to "just handle everything" does not bypass these steps.',
  ] as (string | { s: string; t: string })[],
  encH2: 'Client-side encryption, by design',
  encP1Strong: 'Everything that leaves your device is encrypted on the device first.',
  encP1Rest:
    ' Logs, reports, and any Rootz data synced to your account are encrypted before upload, with a key held by you and never by us — we cannot decrypt your data, and we cannot recover a lost key. There is no email, no password, and no personal profile attached to any of it: your account is a random 16-digit number.',
  encP2Before: 'The free ',
  encP2Link: 'browser scan',
  encP2Rest: ' goes further still: it runs 100% on your computer and uploads nothing at all unless you explicitly save the report.',
  encP3:
    'The single exception to sealed data is an AI payload you approve yourself: before any cloud AI feature sends anything, you preview the exact fields and attachments, see the redactions, identify the provider and model, and give affirmative consent — per payload, every time. Without that approval, nothing readable leaves your device.',
  hwH2: 'Hardware-backed security, labeled honestly',
  hwP1: 'You will never see a generic "TEE secured" badge here. Each implementation gets the label that accurately describes it:',
  hwLis: [
    { t: 'Browser session → ', s: 'Standard remote AI session' },
    { t: 'Android app sandbox → ', s: 'On-device agent runtime' },
    { t: 'Hardware-backed Keystore key → ', s: 'Device-bound cryptographic identity' },
    { t: 'Verified key attestation → ', s: 'Hardware-backed device/key attestation verified' },
    { t: 'StrongBox, where available → ', s: 'StrongBox-backed key' },
  ],
  hwNote:
    'Hardware-backed identity helps protect keys and verify selected device properties. Cloud inference still occurs with the named provider and is not executed inside the Android TEE. And because rooted and unlocked devices can fail verified-boot or attestation requirements, Rootz will offer a supported lower-assurance mode — clearly labeled, never silently relabeled as attested.',
  billH2: 'AI usage and billing',
  billP1:
    'Four separate things will never be blurred together: your Rootz Pro subscription time, an included AI usage allowance, additional prepaid inference usage, and BYOK usage you pay directly to your own provider. Before the first charge you see the feature and task, the provider and model class, the estimated maximum charge, a session spending cap, and your remaining included allowance. During use you see the current charge and remaining budget; the session stops cleanly at the hard cap.',
  billPanelStrong: 'Local tools are free. Cloud AI uses your included allowance or prepaid AI usage. No automatic overages.',
  billPanelRest: ' No overdraft, no automatic top-up, and your usage history never contains message or prompt contents.',
  faqH2: 'Frequently asked questions',
  faqs: [
    {
      q: 'What is Rootz?',
      a: 'Rootz is our power-user toolkit for your own Android device. The free tier includes a system profiler, a task manager and automation, a logcat reader, a firewall manager, a battery monitor, a terminal editor, a file explorer and manager, an APK installer, and a key mapper. Rootz Pro adds the professional instruments — Log Analysis, an archive manager, VNC, RDP and more — plus the AI harness now in development.',
    },
    {
      q: 'What does Rootz Pro include?',
      a: 'Rootz Pro is a $15 / 365-day top-up subscription: Log Analysis today, with the archive manager, VNC, RDP and the AI harness rolling out as they are ready. It is an independent yearly subscription that combines with any Guardian Angel plan — or stands alone — and paying with crypto saves 15%.',
    },
    {
      q: 'Does Rootz use AI?',
      a: 'The Rootz core is deterministic: scans, detection rules, and plans are code, not model output. AI assistance — explanations of your scan report and log diagnostics — is in development and will always be opt-in: you preview the exact data that would be sent, choose the provider, and approve before anything leaves your device. AI proposes explanations; it never authorizes or executes changes.',
    },
    {
      q: 'Can an AI agent root my phone for me?',
      a: 'No. ADB shell access alone does not root a stock production device, and our browser scanner deliberately has no fastboot or flashing path. AI guidance is read-only; unlocking the bootloader and flashing remain explicit, physical, manufacturer-guided actions that you perform and approve yourself.',
    },
    {
      q: 'Is my data private?',
      a: 'Yes. Anything Rootz syncs is encrypted on your device before upload with a key held by you and never by us — we cannot decrypt your data. The browser scan goes further: it runs entirely on your computer and uploads nothing unless you explicitly save the report to your account number.',
    },
    {
      q: 'How will AI usage be billed?',
      a: 'Local tools are free. Cloud AI will use an included allowance or prepaid AI usage, with the provider, model class, estimated maximum charge, and a hard session cap shown before the first charge — no automatic overages and no automatic top-ups, ever.',
    },
  ],
  faqDownload: 'Download Rootz',
  faqScan: 'Scan your device — free',
}

export default rootz
