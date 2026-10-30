# RootMyAndroid (iOS edition)

Parental/family **monitoring** app for the Android devices in your family.
It is a client of the Root My Android API (`rootmyandroid.com/v1`): it reads
the audits and device state that the Rooted utility app (`apps/android`)
syncs from each monitored Android device. It cannot audit or monitor the
iPhone it runs on — monitoring targets are Android devices only.

## Naming

- App Store listing: **Root My Android** (set in App Store Connect at
  submission; not in this repo).
- Home-screen label: **RootMyAndroid** (`CFBundleDisplayName` in
  `ios/RootMyAndroid/Info.plist` — short enough to avoid under-icon
  truncation).
- iOS bundle id: `com.rootmyandroid` (same string as the Android app's
  applicationId — the Play Store and App Store namespaces are separate, so
  this is legal).

## Android preview shell

`android/` is a PREVIEW-ONLY shell (applicationId
`com.rootmyandroid.preview`) so the edition's UI can be reviewed on a
physical Android device before the macOS/Xcode runner exists. The distinct
applicationId matters: an Android app with id `com.rootmyandroid` would
replace Rooted on-device at install time.

Preview release builds are signed with the public debug key (see
`android/app/build.gradle`) — never publish them. Build + install flow is in
`.agents/skills/build/SKILL.md`; the workflow is
`.github/workflows/android-preview.yml`.

The AuditModule native package is Android-utility-only (`apps/android`) and
is intentionally not shipped here.

## iOS builds

Require the macOS/Xcode runner: `bundle install` (Gemfile pins CocoaPods),
`cd ios && pod install`, then build `ios/RootMyAndroid.xcodeproj` with
xcodebuild (Release configuration — see the build skill).
