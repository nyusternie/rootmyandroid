// packages/shared/src/theme.ts — design tokens shared by the mobile apps.
// Values mirror the dark palette on rootmyandroid.com (apps/web). Keep the
// apps' visuals in lockstep with the site: change values here, not per-app.

export const colors = {
  page: '#0d0f12',
  raise: '#15181d',
  inset: '#0a0c0e',
  line: '#23282f',
  ink: '#e8eaed',
  dim: '#9aa3ad',
  faint: '#6b7280',
  accent: '#3d9df2',
  accentDim: '#1c5f9e',
  ok: '#3fb96b',
  warn: '#e0a13e',
  danger: '#e05e5e',
} as const;

export type ThemeColors = typeof colors;

/**
 * Rooted + Guardian palette (apps/android, apps/guardian) — the mobile
 * apps' original dark theme with the blue accent. Values preserved 1:1
 * from the pre-shared inline palettes; do NOT "reconcile" with the site
 * palette above (they intentionally differ).
 */
export const rootedColors = {
  bg: '#0b0e11',
  panel: '#14181d',
  border: '#232a32',
  text: '#e6edf3',
  muted: '#8b98a5',
  faint: '#5b6670',
  accent: '#4c8dff',
  accentDim: '#2b4a7a',
  good: '#3fb950',
  warn: '#d29922',
  /** Guardian only: destructive actions (uninstall). */
  danger: '#e5534b',
} as const;

export type RootedColors = typeof rootedColors;
