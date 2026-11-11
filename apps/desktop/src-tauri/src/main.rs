// apps/desktop/src-tauri/src/main.rs — scaffold entry (owner ruling
// 2026-11-11: minimum scaffolding only). No commands yet — the relay
// client speaks wss from the FRONTEND (ported from the APK's removed
// client role); Rust-side commands arrive only if a native need emerges
// (e.g. key storage in the OS keychain).
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Root My Android Desktop");
}
