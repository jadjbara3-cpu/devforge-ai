// ============================================================================
//  Tauri build script (build.rs)
//  ---------------------------------------------------------------------------
//  Required by `tauri-build`. Reads `tauri.conf.json`, generates the
//  `tauri::Context` type, validates the icon files exist, and emits the
//  `cargo:rerun-if-changed` directives so cargo rebuilds whenever the
//  config or icons change.
//
//  This file is intentionally minimal — everything else lives in main.rs.
// ============================================================================

fn main() {
    tauri_build::build()
}
