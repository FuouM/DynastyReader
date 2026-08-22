#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

mod commands;
mod paths;

use std::collections::HashMap;
use std::sync::Mutex;

#[cfg(any(target_os = "android", target_os = "ios"))]
use tauri::Manager;

fn main() {
    let log_plugin = build_log_plugin();
    let http_client = commands::http::build_client().expect("failed to build http client");

    tauri::Builder::default()
        .plugin(log_plugin)
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            commands::updater::cleanup_old_executables();
            let root = data_root_for(app)?;
            paths::set_root(root);
            let root = paths::ensure_root().map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            log::info!("dynasty-scans-reader: portable data root = {}", root.display());
            Ok(())
        })
        .manage(commands::db::DbPool(Mutex::new(HashMap::new())))
        .manage(commands::http::HttpState(http_client))
        .invoke_handler(tauri::generate_handler![
            commands::http::http_get,
            commands::http::http_download,
            commands::db::db_execute,
            commands::db::db_query,
            commands::db::db_execute_batch,
            commands::db::db_backup,
            commands::db::db_list_backups,
            commands::db::db_restore,
            commands::db::db_restore_from_path,
            commands::fs::file_exists,
            commands::fs::file_exists_batch,
            commands::fs::file_move,
            commands::fs::file_delete,
            commands::fs::dir_stat,
            commands::fs::dir_stat_batch,
            commands::media::ephemeral_convert_images,
            commands::system::open_url,
            commands::system::open_logs_dir,
            commands::updater::check_for_updates,
            commands::updater::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dynasty Scans Reader");
}

/// Data root selection:
///  - desktop keeps the portable `<exe dir>/.data` (or `DSREADER_DATA_DIR`);
///  - mobile must use Tauri's app-data dir (the APK dir is read-only).
/// The chosen root is injected once; every command resolves against it.
#[cfg(any(target_os = "android", target_os = "ios"))]
fn data_root_for(app: &tauri::App) -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    match std::env::var("DSREADER_DATA_DIR") {
        Ok(dir) if !dir.trim().is_empty() => Ok(std::path::PathBuf::from(dir)),
        _ => app
            .path()
            .app_data_dir()
            .map_err(|e| -> Box<dyn std::error::Error> {
                format!("failed to resolve app data dir: {e}").into()
            }),
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn data_root_for(_app: &tauri::App) -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    Ok(paths::data_root())
}

/// Rolling file logger under the portable data root (desktop), stdout in dev.
/// The file target is set up before the app runs so the very first log lines
/// land in `data_root()/logs/dynasty-reader.log`.
fn build_log_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let mut builder = tauri_plugin_log::Builder::new();
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let log_dir = paths::data_root().join("logs");
        let _ = std::fs::create_dir_all(&log_dir);
        builder = builder.targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
                path: log_dir,
                file_name: Some("dynasty-reader.log".to_string()),
            }),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
        ]);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        builder = builder.targets([tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::Stdout,
        )]);
    }
    builder
        .level(log::LevelFilter::Info)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
        .build()
}