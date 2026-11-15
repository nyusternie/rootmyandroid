// apps/android/build-flavor.fdroid.ts — build-flavor flag, FDROID variant.
// metro.config.js maps the './build-flavor' specifier to this file only
// while bundling the fdroid flavor. F-Droid builds ship everything free of
// charge: no billing chip, no top-up CTA, no PRO mention anywhere in the
// UI (owner ruling 2026-11-13; sidecoin fdroiddata!50457 precedent).
// See App.tsx for the gates this drives.

export const IS_FDROID_BUILD = true;
