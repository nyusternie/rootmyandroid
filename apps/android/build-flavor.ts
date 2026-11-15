// apps/android/build-flavor.ts — build-flavor flag, BASE module
// (appstore flavor, dev server, Jest).
//
// metro.config.js redirects the './build-flavor' specifier to
// ./build-flavor.fdroid.ts ONLY while bundling the `fdroid` Android flavor
// (Gradle exposes the flavor to Metro no other way than the bundle task
// name). Every other context — appstore, `react-native start`, Jest —
// resolves this base file, so the default below MUST stay false.
//
// Consumed by App.tsx to gate the mock billing UI and paid-tier copy:
// the fdroid build shows everything free with no payment/upsell surface
// (owner ruling 2026-11-13; F-Droid policy — see
// docs/FDROID-SUBMISSION-PLAN.md and the sidecoin fdroiddata!50457
// precedent).

export const IS_FDROID_BUILD = false;
