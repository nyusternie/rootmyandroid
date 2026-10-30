// apps/guardian/tailwind.config.js
// NativeWind theme — hex values MUST stay in sync with rootedColors in
// packages/shared/src/theme.ts (Tailwind config is CJS and cannot import
// the TS source; update both when the palette changes).
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
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
        danger: '#e5534b',
      },
    },
  },
  plugins: [],
};
