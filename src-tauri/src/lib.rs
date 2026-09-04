mod commands;
mod paths;
pub mod util;
use std::collections::HashMap;
use std::sync::Mutex;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_plugin = build_log_plugin();
    let http_client = match commands::http::build_client() {
        Ok(c) => c,
        Err(e) => {
            // Fatal: TLS/proxy initialization failed. Log to the rolling file
            // then exit cleanly instead of an opaque panic.
            log::error!("fatal: failed to build http client: {e}");
            std::process::exit(1);
        }
    };

    let builder = tauri::Builder::default()
        .plugin(log_plugin)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::new().build());

    builder
        .setup(|app| {
            #[cfg(desktop)]
            commands::updater::cleanup_old_executables();

            let root = data_root_for(app)?;
            paths::set_root(root);
            let root = paths::ensure_root().map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            log::info!("dynasty-scans-reader: portable data root = {}", root.display());
            // The static asset scope in tauri.conf.json is intentionally
            // narrow; grant the resolved portable data root at runtime (a
            // portable install's `<exe dir>/.data` cannot be expressed via
            // static config scope variables).
            app.asset_protocol_scope().allow_directory(&root, true)?;
            Ok(())
        })
        .manage(commands::db::DbPool(Mutex::new(HashMap::new())))
        .manage(commands::http::HttpState(http_client))
        .manage(commands::download_queue::DownloadState::default())
        .invoke_handler(tauri::generate_handler![
            commands::http::http_get,
            commands::http::http_download,
            commands::db::db_execute,
            commands::db::db_query,
            commands::db::db_execute_batch,
            commands::db::db_backup,
            commands::db::db_restore_from_path,
            commands::fs::file_exists,
            commands::fs::file_exists_batch,
            commands::fs::file_move,
            commands::fs::file_delete,
            commands::fs::dir_stat,
            commands::fs::dir_stat_batch,
            commands::media::ephemeral_convert_images,
            commands::local_import::scan_archive,
            commands::local_import::import_archive,
            commands::local_import::scan_folder,
            commands::local_import::import_folder,
            commands::local_import::delete_local_series,
            commands::local_import::update_local_series,
            commands::download_queue::enqueue_chapters,
            commands::download_queue::pause_downloads,
            commands::download_queue::resume_downloads,
            commands::download_queue::cancel_download,
            commands::download_queue::retry_chapter_download,
            commands::download_queue::set_download_constraints,
            commands::download_queue::retry_failed_downloads,
            commands::download_queue::clear_completed_downloads,
            commands::download_queue::get_download_queue,
            commands::system::open_url,
            commands::system::open_logs_dir,
            commands::updater::check_for_updates,
            commands::updater::install_update,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            log::error!("fatal: error while running Dynasty Scans Reader: {e}");
            std::process::exit(1);
        });
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

/// Rolling file logger under the portable data root (desktop), stdout in dev / mobile.
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
