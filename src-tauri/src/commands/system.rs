//! `openUrl` / `openLogsDir` backends.
//!
//! `openUrl` backs the old `PluginHost.system.openUrl` surface (used by
//! `src/api/navigation.ts` for external dynasty-scans.com links). Only
//! `http`/`https` are allowed so a hostile link cannot reach the OS shell via
//! `file://`, `smb:`, `mailto:`, etc. `openLogsDir` reveals the rolling log
//! folder in Explorer so users can attach the log file to bug reports.
use tauri_plugin_opener::OpenerExt;

#[tauri::command(rename = "openUrl")]
pub fn open_url(app: tauri::AppHandle, url: String) -> Result<serde_json::Value, String> {
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err("only http/https URLs may be opened".to_string());
    }
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("failed to open url: {e}"))?;
    Ok(serde_json::json!({}))
}

#[tauri::command(rename = "openLogsDir")]
pub fn open_logs_dir() -> Result<serde_json::Value, String> {
    let logs_dir = crate::paths::data_root().join("logs");
    std::fs::create_dir_all(&logs_dir)
        .map_err(|e| format!("failed creating logs directory: {e}"))?;
    open::that(&logs_dir).map_err(|e| format!("failed to open logs directory: {e}"))?;
    Ok(serde_json::json!({
        "absolute_path": logs_dir.to_string_lossy().into_owned(),
    }))
}