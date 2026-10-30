// apps/ios/tailwind.config.js
// NativeWind theme — hex values MUST stay in sync with `colors` in
// packages/shared/src/theme.ts, which mirrors the rootmyandroid.com
// palette (apps/web/src/styles/global.css @theme tokens). Tailwind config
// is CJS and cannot import the TS source; update all three when the
// palette changes.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
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
      },
    },
  },
  plugins: [],
};
