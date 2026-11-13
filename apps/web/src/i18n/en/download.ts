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
    'Rolling UI/UX iteration build from master (rolling tag android-apk), signed with the PUBLIC debug key — review builds only, never production; it cannot update over an upload-signed install (uninstall first).',
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
  requiresBefore: 'Requires Android 7.0 (API 24) or later. The Rootz and Guardian Angel APKs are signed with our upload key; you can verify signatures and checksums against the ',
  requiresLink: 'release notes',
  requiresAfter: '.',
  previewNote:
    'These are preview builds — product features are rolling out. The free tier covers basic scanning and documentation.',
}

export default download
