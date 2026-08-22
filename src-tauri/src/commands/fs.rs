//! `fileExists` / `fileMove` / `fileDelete` / `dirStat` backends.
//!
//! Mirrors the Curator handlers (`curator-service/src/handlers/plugin_commands/storage.rs`):
//! paths are confined to the portable data root, `fileExists` reports a file as
//! existing only when it is at least `min_size` bytes (default 1 — so
//! zero-byte files count as missing for cover/page probing; pass `min_size: 0`
//! to treat them as present), `dirStat` works on both directories (recursive)
//! and single files, and `fileDelete` supports both. Batch variants
//! (`fileExistsBatch`, `dirStatBatch`) resolve many paths in one call so the
//! frontend stops issuing per-file IPC bursts. Recursive walks run on the
//! blocking pool.

use serde_json::json;
use walkdir::WalkDir;

fn stat_file(target: &std::path::Path, min_size: u64) -> (bool, u64) {
    let meta = target.metadata().ok();
    let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
    (target.is_file() && size >= min_size, size)
}

#[tauri::command(rename = "fileExists")]
pub fn file_exists(path: String, min_size: Option<u64>) -> Result<serde_json::Value, String> {
    let target = crate::paths::resolve_in_root(&path)?;
    let (exists, size) = stat_file(&target, min_size.unwrap_or(1));
    Ok(json!({
        "exists": exists,
        "size_bytes": size,
        "absolute_path": target.to_string_lossy().into_owned(),
    }))
}

#[tauri::command(rename = "fileExistsBatch")]
pub async fn file_exists_batch(
    paths: Vec<String>,
    min_size: Option<u64>,
) -> Result<serde_json::Value, String> {
    let min_size = min_size.unwrap_or(1);
    let items = tokio::task::spawn_blocking(move || {
        paths
            .iter()
            .map(|p| match crate::paths::resolve_in_root(p) {
                Ok(target) => {
                    let (exists, size) = stat_file(&target, min_size);
                    json!({
                        "path": p,
                        "exists": exists,
                        "size_bytes": size,
                        "absolute_path": target.to_string_lossy().into_owned(),
                        "error": "",
                    })
                }
                Err(e) => json!({
                    "path": p,
                    "exists": false,
                    "size_bytes": 0,
                    "absolute_path": "",
                    "error": e,
                }),
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| format!("file exists batch failed: {e}"))?;
    Ok(json!({ "items": items }))
}

#[tauri::command(rename = "fileMove")]
pub fn file_move(src: String, dst: String) -> Result<serde_json::Value, String> {
    let src_target = crate::paths::resolve_in_root(&src)?;
    let dst_target = crate::paths::resolve_in_root(&dst)?;
    if let Some(parent) = dst_target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed creating parent directory: {e}"))?;
    }
    match std::fs::rename(&src_target, &dst_target) {
        Ok(()) => {}
        Err(e) if is_cross_device(&e) => {
            // Cross-device move (e.g. DSREADER_DATA_DIR on a different volume):
            // copy recursively, then remove the source.
            copy_tree(&src_target, &dst_target)?;
            if src_target.is_dir() {
                std::fs::remove_dir_all(&src_target)
                    .map_err(|e| format!("file move cleanup failed: {e}"))?;
            } else {
                std::fs::remove_file(&src_target)
                    .map_err(|e| format!("file move cleanup failed: {e}"))?;
            }
        }
        Err(e) => return Err(format!("file move failed: {e}")),
    }
    Ok(json!({
        "absolute_path": dst_target.to_string_lossy().into_owned(),
    }))
}

fn is_cross_device(e: &std::io::Error) -> bool {
    // EXDEV on POSIX (18); ERROR_NOT_SAME_DEVICE on Windows (17).
    matches!(e.raw_os_error(), Some(18) | Some(17))
}

fn copy_tree(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    if !src.is_dir() {
        return std::fs::copy(src, dst)
            .map(|_| ())
            .map_err(|e| format!("file move copy failed: {e}"));
    }
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("file move copy failed: {e}"))?;
    for entry in WalkDir::new(src).follow_links(false).min_depth(1) {
        let entry = entry.map_err(|e| format!("file move copy failed: {e}"))?;
        let rel = entry.path().strip_prefix(src).map_err(|e| format!("file move copy failed: {e}"))?;
        let out = dst.join(rel);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| format!("file move copy failed: {e}"))?;
        } else {
            std::fs::copy(entry.path(), &out)
                .map_err(|e| format!("file move copy failed: {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command(rename = "fileDelete")]
pub fn file_delete(path: String) -> Result<serde_json::Value, String> {
    let target = crate::paths::resolve_in_root(&path)?;
    if target.is_dir() {
        std::fs::remove_dir_all(&target)
            .map_err(|e| format!("directory delete failed: {e}"))?;
    } else {
        std::fs::remove_file(&target).map_err(|e| format!("file delete failed: {e}"))?;
    }
    Ok(json!({}))
}

fn stat_one(target: &std::path::Path) -> (u64, u64) {
    if target.is_file() {
        return (target.metadata().map(|m| m.len()).unwrap_or(0), 1);
    }
    if !target.is_dir() {
        return (0, 0);
    }
    let mut total_bytes: u64 = 0;
    let mut file_count: u64 = 0;
    for entry in WalkDir::new(target).follow_links(false).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                total_bytes += meta.len();
                file_count += 1;
            }
        }
    }
    (total_bytes, file_count)
}

#[tauri::command(rename = "dirStat")]
pub async fn dir_stat(path: Option<String>) -> Result<serde_json::Value, String> {
    let target = crate::paths::resolve_in_root(path.as_deref().unwrap_or(""))?;
    let abs = target.to_string_lossy().into_owned();
    let (total_bytes, file_count) = tokio::task::spawn_blocking(move || stat_one(&target))
        .await
        .map_err(|e| format!("dir stat task failed: {e}"))?;
    Ok(json!({
        "total_bytes": total_bytes,
        "file_count": file_count,
        "absolute_path": abs,
    }))
}

#[tauri::command(rename = "dirStatBatch")]
pub async fn dir_stat_batch(paths: Vec<String>) -> Result<serde_json::Value, String> {
    let items = tokio::task::spawn_blocking(move || {
        paths
            .iter()
            .map(|p| match crate::paths::resolve_in_root(p) {
                Ok(target) => {
                    let (total_bytes, file_count) = stat_one(&target);
                    json!({
                        "path": p,
                        "total_bytes": total_bytes,
                        "file_count": file_count,
                        "absolute_path": target.to_string_lossy().into_owned(),
                        "error": "",
                    })
                }
                Err(e) => json!({
                    "path": p,
                    "total_bytes": 0,
                    "file_count": 0,
                    "absolute_path": "",
                    "error": e,
                }),
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| format!("dir stat batch failed: {e}"))?;
    Ok(json!({ "items": items }))
}