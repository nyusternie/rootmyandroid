// packages/shared/src/theme.ts — design tokens shared by the mobile apps.
// Values mirror the dark palette on rootmyandroid.com (apps/web). Keep the
// apps' visuals in lockstep with the site: change values here, not per-app.

export const colors = {
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
} as const;

export type ThemeColors = typeof colors;
