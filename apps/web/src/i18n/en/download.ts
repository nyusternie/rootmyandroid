// src/i18n/en/download.ts — English (default locale) download-page
// dictionary. Contract for zh/ru/ko (typed `typeof en`). APK filenames,
// package names, URLs, store names, and version strings are never translated.
const download = {
  metaTitle: 'Download the apps',
  metaDescription:
    'Download Root My Android — the featured client, direct APK. Apple App Store and Google Play coming soon. Rootz and Guardian Angel preview APKs remain available.',
  h1: 'Download the apps',
  tagline:
    'Direct APK downloads — the featured client ships as a rolling build; the v1.0.0 preview apps stay available below.',
  heroCta: 'Download the latest build',
  heroInstall: 'How to install',
  heroArtAlt:
    'The Root My Android SU superhero — a green Android robot with a red cape holding a glowing yellow diamond, three app tiles floating around it',
  trustAndroid: 'Android 7.0+',
  trustSigned: 'Signed APKs',
  trustFree: 'Free scan core, no account',
  featuredEyebrow: 'Featured client',
  featuredStatus: 'Rolling build from master — a fresh APK on every CI run',
  featuredArtAlt:
    'The Root My Android SU superhero — a green Android robot with a red cape and a yellow SU chest shield',
  appStoreName: 'Apple App Store',
  playStoreName: 'Google Play',
  comingSoon: 'Coming soon',
  appsH2: 'Three apps, one download page',
  appsNote: 'Every APK installs directly — no store account needed.',
  downloadCta: 'Download',
  packageLabel: 'Package',
  featuredBadge: 'Latest build',
  rootzBadge: 'Rolling preview',
  guardianBadge: 'v1.0.0 preview',
  featuredPoint1: 'Read-only device scan over ADB',
  featuredPoint2: 'Encrypted backups to your account',
  featuredPoint3: 'Paired Guardian devices and tools',
  rootzPoint1: 'Wireless-ADB pairing and shell',
  rootzPoint2: 'Relay daemon on non-rooted phones',
  rootzPoint3: 'Terminal editor and log analysis (Pro)',
  guardianPoint1: 'Usage stats and ad blocking',
  guardianPoint2: 'Message and call-log monitoring',
  guardianPoint3: 'Up to 5 devices per account',
  rootzH2: 'Rootz',
  rootzArtAlt:
    'Colonel Su — an elderly green Android robot with a white beard, round glasses, and a charcoal robe, holding a staff with the yellow SU diamond',
  guardianH2: 'Guardian Angel',
  guardianArtAlt: 'The Guardian Angel — a green Android robot with a thin golden halo',
  startH2: 'Not sure which build?',
  startP: 'Start with the free in-browser scan — no install, no account.',
  startCta: 'Open the free scan',
  installH2: 'Install',
  installStep1: 'Download the APK on your Android device.',
  installStep2Before: 'Open it, and allow ',
  installStep2Strong: 'install unknown apps',
  installStep2After: ' for your browser when Android prompts you.',
  installStep3Before: 'Tap ',
  installStep3Strong: 'Install',
  installStep3After: '.',
  verifyH3: 'Verify what you download',
  verifyP:
    'Every APK is signed. The featured build uses our current upload key; the v1.0.0 previews use the earlier preview key.',
  verifyCurrent: 'Current upload key (SHA-256)',
  verifyLegacy: 'v1.0.0 preview key (SHA-256)',
  verifyNote:
    'Compare the signing certificate against these fingerprints with apksigner or your file manager.',
  requiresBefore:
    'Requires Android 7.0 (API 24) or later. Compare each APK\'s signature against the fingerprints above, or browse the ',
  requiresLink: 'release notes',
  requiresAfter: '.',
  previewNote:
    'These are preview builds — product features are rolling out. The free tier covers basic scanning and documentation.',
  sideloadTitle: 'Before you sideload',
  sideloadApp: 'Downloading',
  sideloadStep1: 'Tap “Continue to download” — the APK lands in your Downloads folder.',
  sideloadStep2: 'Android asks about unknown apps: allow installs for your browser (one-time).',
  sideloadStep3: 'Open the APK from the notification or your Downloads app and tap “Install”.',
  sideloadNote:
    'The featured APK is signed with our current upload key; the v1.0.0 previews use the earlier preview key. Android refuses updates across a signature change — uninstall the old app first.',
  sideloadContinue: 'Continue to download',
  sideloadCancel: 'Cancel',
}

export default download
