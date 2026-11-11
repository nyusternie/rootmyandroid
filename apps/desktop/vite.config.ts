// apps/desktop/vite.config.ts
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Tauri v2 expects a fixed dev port and clearscreen=false (its CLI reads
// the vite banner); build output goes to dist/ (frontendDist in
// src-tauri/tauri.conf.json). Scaffold only — see README.md.
export default defineConfig({
  plugins: [tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
})
