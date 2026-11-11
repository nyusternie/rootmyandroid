// apps/desktop/src/main.ts — scaffold entry (owner ruling 2026-11-11:
// minimum scaffolding only). The real relay client (ported from the APK's
// removed RelayConnection/E2eSession client role — see README.md) lands
// here in a later phase.
import './styles.css'

// Set the native window title when running inside the Tauri webview; the
// api package guards are unnecessary in a plain browser (vite dev), so the
// import stays dynamic and the presence check is explicit.
if ('__TAURI_INTERNALS__' in window) {
  import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => getCurrentWindow().setTitle('Root My Android Desktop'))
    .catch(() => {
      // Title is cosmetic — never fatal.
    })
}
