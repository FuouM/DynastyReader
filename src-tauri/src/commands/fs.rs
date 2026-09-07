//! `fileExists` / `fileMove` / `fileDelete` / `dirStat` backends.
//!
//! Sandboxed filesystem operations confined to the portable data root. `fileExists`
//! reports a file as existing only when it is at least `min_size` bytes (default 1),
//! `dirStat` calculates recursive directory or single-file sizes, and batch variants
//! (`fileExistsBatch`, `dirStatBatch`) resolve multiple paths in one call to minimize
//! IPC overhead. Recursive directory walks run on the blocking pool.
use serde::{Deserialize, Serialize};
use serde_json::json;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrityCheckRequestItem {
    pub id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrityCheckResultItem {
    pub id: String,
    pub path: String,
    pub exists: bool,
    pub size_bytes: u64,
    pub is_valid: bool,
    pub error: Option<String>,
}

fn probe_image_file(path: &std::path::Path) -> Result<(u32, u32), String> {
    let reader = image::ImageReader::open(path)
        .map_err(|e| format!("cannot open: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("unknown image format: {e}"))?;
    let (w, h) = reader
        .into_dimensions()
        .map_err(|e| format!("corrupted image header: {e}"))?;
    if w == 0 || h == 0 {
        return Err("zero dimension image".to_string());
    }
    Ok((w, h))
}
fn stat_file(target: &std::path::Path, min_size: u64) -> (bool, u64) {
    let meta = target.metadata().ok();
    let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
    (target.is_file() && size >= min_size, size)
}

#[tauri::command(rename = "fileExists")]
pub async fn file_exists(path: String, min_size: Option<u64>) -> Result<serde_json::Value, String> {
    let target = crate::paths::resolve_in_root(&path)?;
    let min = min_size.unwrap_or(1);
    let target_for_stat = target.clone();
    let (exists, size) = tokio::task::spawn_blocking(move || stat_file(&target_for_stat, min))
        .await
        .map_err(|e| format!("file exists task failed: {e}"))?;
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
#[tauri::command(rename = "verifyFileIntegrityBatch")]
pub async fn verify_file_integrity_batch(
    items: Vec<IntegrityCheckRequestItem>,
) -> Result<Vec<IntegrityCheckResultItem>, String> {
    tokio::task::spawn_blocking(move || {
        items
            .into_iter()
            .map(|item| match crate::paths::resolve_in_root(&item.path) {
                Ok(target) => {
                    if !target.is_file() {
                        IntegrityCheckResultItem {
                            id: item.id,
                            path: item.path,
                            exists: false,
                            size_bytes: 0,
                            is_valid: false,
                            error: Some("File does not exist on disk".to_string()),
                        }
                    } else {
                        let size = target.metadata().map(|m| m.len()).unwrap_or(0);
                        if size == 0 {
                            IntegrityCheckResultItem {
                                id: item.id,
                                path: item.path,
                                exists: true,
                                size_bytes: 0,
                                is_valid: false,
                                error: Some("File is 0 bytes (corrupted/empty)".to_string()),
                            }
                        } else {
                            match probe_image_file(&target) {
                                Ok(_) => IntegrityCheckResultItem {
                                    id: item.id,
                                    path: item.path,
                                    exists: true,
                                    size_bytes: size,
                                    is_valid: true,
                                    error: None,
                                },
                                Err(err) => IntegrityCheckResultItem {
                                    id: item.id,
                                    path: item.path,
                                    exists: true,
                                    size_bytes: size,
                                    is_valid: false,
                                    error: Some(err),
                                },
                            }
                        }
                    }
                }
                Err(e) => IntegrityCheckResultItem {
                    id: item.id,
                    path: item.path,
                    exists: false,
                    size_bytes: 0,
                    is_valid: false,
                    error: Some(e),
                },
            })
            .collect()
    })
    .await
    .map_err(|e| format!("verify file integrity task failed: {e}"))
}

#[tauri::command(rename = "fileDeleteBatch")]
pub async fn file_delete_batch(paths: Vec<String>) -> Result<usize, String> {
    tokio::task::spawn_blocking(move || {
        let mut deleted = 0;
        for path in paths {
            if let Ok(target) = crate::paths::resolve_in_root(&path) {
                if target.is_file() && std::fs::remove_file(&target).is_ok() {
                    deleted += 1;
                }
            }
        }
        Ok(deleted)
    })
    .await
    .map_err(|e| format!("file delete batch task failed: {e}"))?
}

#[tauri::command(rename = "fileMove")]
pub async fn file_move(src: String, dst: String) -> Result<serde_json::Value, String> {
    // Cross-device fallback copies whole trees — never run that on the caller
    // thread (non-async Tauri commands execute on the main event loop).
    tokio::task::spawn_blocking(move || file_move_blocking(src, dst))
        .await
        .map_err(|e| format!("file move task failed: {e}"))?
}

fn file_move_blocking(src: String, dst: String) -> Result<serde_json::Value, String> {
    if src.trim().is_empty() || dst.trim().is_empty() {
        return Err("src and dst cannot be empty".to_string());
    }
    let src_target = crate::paths::resolve_in_root(&src)?;
    let dst_target = crate::paths::resolve_in_root(&dst)?;
    if crate::paths::is_root_dir(&src_target)? {
        return Err("cannot move root data directory".to_string());
    }
    if crate::paths::is_root_dir(&dst_target)? {
        return Err("cannot overwrite root data directory".to_string());
    }
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
pub async fn file_delete(path: String) -> Result<serde_json::Value, String> {
    if path.trim().is_empty() {
        return Err("cannot delete root data directory".to_string());
    }
    let target = crate::paths::resolve_in_root(&path)?;
    if crate::paths::is_root_dir(&target)? {
        return Err("cannot delete root data directory".to_string());
    }
    tokio::task::spawn_blocking(move || {
        if target.is_dir() {
            std::fs::remove_dir_all(&target).map_err(|e| format!("directory delete failed: {e}"))?;
        } else {
            std::fs::remove_file(&target).map_err(|e| format!("file delete failed: {e}"))?;
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("file delete task failed: {e}"))??;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_verify_file_integrity_batch() {
        let root = crate::paths::temp_root("shared");
        crate::paths::set_root(root.clone());

        // 1. Create a 0-byte file
        let zero_path = root.join("zero.jpg");
        std::fs::write(&zero_path, b"").unwrap();

        // 2. Create a corrupted file (invalid image bytes)
        let corrupt_path = root.join("corrupt.webp");
        std::fs::write(&corrupt_path, b"this is not an image at all").unwrap();

        // 3. Create a valid 1x1 PNG image
        let valid_png_bytes: [u8; 67] = [
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ];
        let valid_path = root.join("valid.png");
        std::fs::write(&valid_path, &valid_png_bytes).unwrap();

        let items = vec![
            IntegrityCheckRequestItem {
                id: "missing_item".to_string(),
                path: "non_existent.webp".to_string(),
            },
            IntegrityCheckRequestItem {
                id: "zero_item".to_string(),
                path: "zero.jpg".to_string(),
            },
            IntegrityCheckRequestItem {
                id: "corrupt_item".to_string(),
                path: "corrupt.webp".to_string(),
            },
            IntegrityCheckRequestItem {
                id: "valid_item".to_string(),
                path: "valid.png".to_string(),
            },
        ];

        let results = verify_file_integrity_batch(items).await.unwrap();
        assert_eq!(results.len(), 4);

        // Check missing
        assert_eq!(results[0].id, "missing_item");
        assert!(!results[0].exists);
        assert!(!results[0].is_valid);

        // Check zero bytes
        assert_eq!(results[1].id, "zero_item");
        assert!(results[1].exists);
        assert_eq!(results[1].size_bytes, 0);
        assert!(!results[1].is_valid);

        // Check corrupt
        assert_eq!(results[2].id, "corrupt_item");
        assert!(results[2].exists);
        assert!(results[2].size_bytes > 0);
        assert!(!results[2].is_valid);

        // Check valid
        assert_eq!(results[3].id, "valid_item");
        assert!(results[3].exists);
        assert!(results[3].size_bytes > 0);
        assert!(results[3].is_valid);
        assert!(results[3].error.is_none());

        // Test delete batch
        let to_delete = vec!["zero.jpg".to_string(), "corrupt.webp".to_string()];
        let deleted = file_delete_batch(to_delete).await.unwrap();
        assert_eq!(deleted, 2);
        assert!(!zero_path.exists());
        assert!(!corrupt_path.exists());
        assert!(valid_path.exists());

    }
}