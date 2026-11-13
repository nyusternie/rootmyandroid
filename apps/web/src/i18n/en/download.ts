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
  featuredEyebrow: 'Featured client',
  featuredTitle: 'Root My Android',
  featuredDescAfter: ' — the client: device scan, paired Guardian devices, encrypted backups, and tools.',
  featuredStatus: 'Rolling build from master — a fresh APK on every CI run',
  featuredLink: 'Download rootmyandroid-release.apk',
  featuredNote:
    'Rolling UI/UX iteration build from master (rolling tag android-apk), signed with our upload key. Installs from the v1.0.0 preview release or earlier debug-signed builds must be uninstalled once before updating.',
  featuredArtAlt:
    'The Root My Android SU superhero — a green Android robot with a red cape and a yellow SU chest shield',
  appStoreName: 'Apple App Store',
  playStoreName: 'Google Play',
  comingSoon: 'Coming soon',
  secondaryHeading: 'More downloads',
  secondaryNote: 'Rootz and Guardian Angel are sideloaded as APKs.',
  rootzH2: 'Rootz',
  rootzDescAfter: ' — the device-analysis app (v1.0.0 preview).',
  rootzLink: 'Download rooted-release.apk',
  guardianH2: 'Guardian Angel',
  guardianDescAfter: ' — the companion-monitoring app (v1.0.0 preview).',
  guardianLink: 'Download guardian-release.apk',
  guardianArtAlt: 'The Guardian Angel — a green Android robot with a thin golden halo',
  installH2: 'Install',
  installStep1: 'Download the APK on your Android device.',
  installStep2Before: 'Open it, and allow ',
  installStep2Strong: 'install unknown apps',
  installStep2After: ' for your browser when Android prompts you.',
  installStep3Before: 'Tap ',
  installStep3Strong: 'Install',
  installStep3After: '.',
  requiresBefore: 'Requires Android 7.0 (API 24) or later. All three APKs are signed with our upload key; you can verify signatures and checksums against the ',
  requiresLink: 'release notes',
  requiresAfter: '.',
  previewNote:
    'These are preview builds — product features are rolling out. The free tier covers basic scanning and documentation.',
  sideloadTitle: 'Before you sideload',
  sideloadStep1: 'Tap “Continue to download” — the APK lands in your Downloads folder.',
  sideloadStep2: 'Android asks about unknown apps: allow installs for your browser (one-time).',
  sideloadStep3: 'Open the APK from the notification or your Downloads app and tap “Install”.',
  sideloadNote:
    'All three APKs are signed with our upload key. If you installed the app before 2026-11-13, uninstall it first — Android refuses signature changes.',
  sideloadContinue: 'Continue to download',
  sideloadCancel: 'Cancel',
}

export default download
