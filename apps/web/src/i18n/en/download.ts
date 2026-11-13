// src/i18n/en/download.ts — English (default locale) download-page
// dictionary. Contract for zh/ru/ko (typed `typeof en`). APK filenames,
// package names, URLs, and version strings are never translated.
const download = {
  metaTitle: 'Download the apps',
  metaDescription:
    'Download the Rootz and Guardian Angel Android apps — direct APK downloads of the latest preview release.',
  h1: 'Download the apps',
  tagline: 'Preview release v1.0.0 — direct APK downloads, always pointing to the latest release.',
  rootzH2: 'Rootz',
  rootzDescAfter: ' — the device-analysis app.',
  rootzLink: 'Download rooted-release.apk',
  guardianH2: 'Guardian Angel',
  guardianDescAfter: ' — the companion-monitoring app.',
  guardianLink: 'Download guardian-release.apk',
  androidH2: 'Root My Android (Android edition)',
  androidDescAfter: ' — device scan, paired Guardian devices, encrypted backups, and tools.',
  androidLink: 'Download rootmyandroid-release.apk',
  androidNote:
    'Rolling UI/UX iteration build from master (rolling tag android-apk), signed with the PUBLIC debug key — review builds only, never production; it cannot update over an upload-signed install (uninstall first).',
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
