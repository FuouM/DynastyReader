//! In-app updater for standalone portable binary distribution.
//!
//! Checks the latest GitHub release of DynastyReader, compares SemVer,
//! downloads the updated executable, and performs atomic replacement on Windows.

use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};
use crate::commands::http::HttpState;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UpdateInfo {
    pub has_update: bool,
    pub latest_version: String,
    pub current_version: String,
    pub release_notes: String,
    pub download_url: String,
    pub asset_size: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percentage: f64,
}

fn is_version_newer(latest: &str, current: &str) -> bool {
    let parse = |v: &str| {
        let clean = v.trim().trim_start_matches('v');
        semver::Version::parse(clean)
    };
    match (parse(latest), parse(current)) {
        (Ok(l), Ok(c)) => l > c,
        // Unparsable tags (e.g. "nightly") are never treated as a newer
        // version — otherwise any malformed tag would prompt a download loop.
        _ => false,
    }
}

const OFFICIAL_RELEASE_PREFIX: &str = "https://github.com/FuouM/DynastyReader/releases/download/";
const MAX_UPDATE_DOWNLOAD_BYTES: u64 = 256 * 1024 * 1024;
const MAX_RELEASE_API_BODY: usize = 2 * 1024 * 1024;

fn get_target_extension() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        ".exe"
    }
    #[cfg(target_os = "linux")]
    {
        ".AppImage"
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        ""
    }
}

fn matches_target_extension(filename: &str) -> bool {
    let ext = get_target_extension();
    !ext.is_empty() && filename.ends_with(ext)
}

pub fn validate_update_download_url(url: &str) -> Result<(), String> {
    if url.is_empty() {
        return Err("Download URL cannot be empty".to_string());
    }
    if !url.starts_with("https://") {
        return Err("Update download URL must use HTTPS".to_string());
    }
    if !url.starts_with(OFFICIAL_RELEASE_PREFIX) {
        return Err("Update download URL must originate from the official DynastyReader repository releases".to_string());
    }

    if !matches_target_extension(url) {
        let target_ext = get_target_extension();
        return Err(format!("Update asset must have the expected extension ({target_ext})"));
    }

    Ok(())
}

/// Checks the official GitHub repository for new releases.
#[tauri::command(rename = "checkForUpdates")]
pub async fn check_for_updates(app: AppHandle, http_state: State<'_, HttpState>) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();

    let mut headers = serde_json::Map::new();
    headers.insert(
        "Accept".to_string(),
        serde_json::Value::String("application/vnd.github.v3+json".to_string()),
    );
    let resp = crate::commands::http::send_with_redirects(
        &http_state.0,
        "GET",
        "https://api.github.com/repos/FuouM/DynastyReader/releases/latest",
        None,
        None,
        Some(&headers),
        None,
    )
    .await
    .map_err(|e| format!("failed to query GitHub releases: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub API returned HTTP {}", resp.status()));
    }

    if let Some(cl) = resp.content_length() {
        if cl > MAX_RELEASE_API_BODY as u64 {
            return Err(format!("GitHub API response exceeds maximum permitted size ({cl} > {MAX_RELEASE_API_BODY})"));
        }
    }

    let bytes = crate::commands::http::read_body_capped(resp, MAX_RELEASE_API_BODY).await?;
    let json: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|e| format!("failed to parse GitHub release response: {e}"))?;
    let tag_name = json["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    let release_notes = json["body"].as_str().unwrap_or("").to_string();

    let mut download_url = String::new();
    let mut asset_size = 0u64;

    if let Some(assets) = json["assets"].as_array() {
        for asset in assets {
            let name = asset["name"].as_str().unwrap_or("");
            if matches_target_extension(name) {
                download_url = asset["browser_download_url"].as_str().unwrap_or("").to_string();
                asset_size = asset["size"].as_u64().unwrap_or(0);
                break;
            }
        }
    }

    let has_update = is_version_newer(&tag_name, &current_version) && !download_url.is_empty();

    Ok(UpdateInfo {
        has_update,
        latest_version: tag_name,
        current_version,
        release_notes,
        download_url,
        asset_size,
    })
}

/// Downloads the new executable and performs the atomic replacement dance on Windows.
#[tauri::command(rename = "installUpdate")]
pub async fn install_update(app: AppHandle, http_state: State<'_, HttpState>, download_url: String) -> Result<(), String> {
    validate_update_download_url(&download_url)?;

    let current_exe = env::current_exe().map_err(|e| format!("Cannot locate current executable: {e}"))?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| "Cannot determine executable directory".to_string())?;

    let file_name = current_exe
        .file_name()
        .ok_or_else(|| "Cannot determine executable filename".to_string())?;

    let old_exe: PathBuf = exe_dir.join(format!("{}.old", file_name.to_string_lossy()));

    log::info!("Downloading update from: {download_url}");
    let response = crate::commands::http::send_with_redirects(
        &http_state.0,
        "GET",
        &download_url,
        None,
        None,
        None,
        // Large release binaries need a generous total timeout (default is 30s).
        Some(600_000),
    )
    .await
    .map_err(|e| format!("failed to start download: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("download request failed with HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);

    let temp_update = tempfile::Builder::new()
        .prefix(".tmp-update-")
        .tempfile_in(exe_dir)
        .map_err(|e| format!("failed to create temporary update file: {e}"))?;
    let (std_file, new_exe) = temp_update
        .keep()
        .map_err(|e| format!("failed to retain temporary update file: {e}"))?;

    let mut file = tokio::fs::File::from_std(std_file);
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let app_for_progress = app.clone();
    let stream_result = crate::commands::http::stream_to_file_capped(
        &mut stream,
        &mut file,
        MAX_UPDATE_DOWNLOAD_BYTES,
        |len| {
            downloaded += len;
            let percentage = if total_size > 0 {
                (downloaded as f64 / total_size as f64) * 100.0
            } else {
                0.0
            };
            if let Err(e) = app_for_progress.emit(
                "update-progress",
                DownloadProgress {
                    downloaded_bytes: downloaded,
                    total_bytes: total_size,
                    percentage,
                },
            ) {
                log::warn!("failed emitting update-progress: {e}");
            }
        },
    )
    .await;
    // Preserve original updater cap error wording
    let stream_result = match stream_result {
        Err(e) if e.contains("exceeds size cap") => Err(format!(
            "Update download exceeded safety limit of {MAX_UPDATE_DOWNLOAD_BYTES} bytes"
        )),
        other => other,
    };
    drop(file);
    if let Err(err) = stream_result {
        let _ = tokio::fs::remove_file(&new_exe).await;
        return Err(err);
    }
    log::info!("Download complete ({downloaded} bytes). Applying self-replacement...");

    #[cfg(target_os = "windows")]
    {
        // 1. Remove previous leftover .old if present
        if old_exe.exists() {
            if let Err(e) = fs::remove_file(&old_exe) {
                log::warn!("failed removing old executable: {e}");
            }
        }

        // 2. Windows allows renaming a running binary
        fs::rename(&current_exe, &old_exe)
            .map_err(|e| format!("failed to move running executable to .old: {e}"))?;

        // 3. Move .new into current_exe
        if let Err(e) = fs::rename(&new_exe, &current_exe) {
            // Rollback if renaming new exe failed
            if let Err(e) = fs::rename(&old_exe, &current_exe) {
                log::warn!("rollback rename failed: {e}");
            }
            return Err(format!("failed to activate new executable: {e}"));
        }

        // 4. Launch the new executable and exit current process
        log::info!("Launching updated binary: {}", current_exe.display());
        std::process::Command::new(&current_exe)
            .spawn()
            .map_err(|e| format!("failed to launch updated binary: {e}"))?;

        std::process::exit(0);
    }

    #[cfg(not(target_os = "windows"))]
    {
        // For Unix / AppImage
        #[cfg(target_family = "unix")]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Err(e) = fs::set_permissions(&new_exe, fs::Permissions::from_mode(0o755)) {
                log::warn!("failed setting permissions on new executable: {e}");
            }
        }

        if old_exe.exists() {
            if let Err(e) = fs::remove_file(&old_exe) {
                log::warn!("failed removing old executable: {e}");
            }
        }
        fs::rename(&current_exe, &old_exe)
            .map_err(|e| format!("failed to backup executable: {e}"))?;
        fs::rename(&new_exe, &current_exe)
            .map_err(|e| format!("failed to activate new executable: {e}"))?;

        std::process::Command::new(&current_exe)
            .spawn()
            .map_err(|e| format!("failed to launch updated binary: {e}"))?;

        std::process::exit(0);
    }
}

/// Cleans up any `.old` and `.new` leftover binary files in the executable directory on startup.
#[cfg(desktop)]
pub fn cleanup_old_executables() {
    if let Ok(current_exe) = env::current_exe() {
        if let Some(dir) = current_exe.parent() {
            if let Some(file_name) = current_exe.file_name() {
                let old_exe = dir.join(format!("{}.old", file_name.to_string_lossy()));
                if old_exe.exists() {
                    if let Err(e) = fs::remove_file(old_exe) {
                        log::warn!("failed cleaning up old executable: {e}");
                    }
                }
                let new_exe = dir.join(format!("{}.new", file_name.to_string_lossy()));
                if new_exe.exists() {
                    if let Err(e) = fs::remove_file(new_exe) {
                        log::warn!("failed cleaning up new executable: {e}");
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_version_newer() {
        assert!(is_version_newer("v0.2.0", "v0.1.0"));
        assert!(is_version_newer("0.2.0", "0.1.0"));
        assert!(is_version_newer("v1.0.0", "v0.9.9"));
        assert!(is_version_newer("0.1.1", "0.1.0"));
        assert!(!is_version_newer("0.1.0", "0.1.0"));
        assert!(!is_version_newer("v0.1.0", "0.1.0"));
        assert!(!is_version_newer("0.1.0", "0.2.0"));
        assert!(!is_version_newer("0.1.0-alpha", "0.1.0"));
        assert!(is_version_newer("0.1.0", "0.1.0-alpha"));
    }

    #[test]
    fn test_validate_update_download_url() {
        #[cfg(target_os = "windows")]
        {
            assert!(validate_update_download_url("https://github.com/FuouM/DynastyReader/releases/download/v0.2.0/DynastyReader.exe").is_ok());
            assert!(validate_update_download_url("http://github.com/FuouM/DynastyReader/releases/download/v0.2.0/DynastyReader.exe").is_err());
            assert!(validate_update_download_url("https://evil.com/releases/download/v0.2.0/DynastyReader.exe").is_err());
            assert!(validate_update_download_url("https://github.com/OtherRepo/DynastyReader/releases/download/v0.2.0/DynastyReader.exe").is_err());
            assert!(validate_update_download_url("https://github.com/FuouM/DynastyReader/releases/download/v0.2.0/malicious.bat").is_err());
            assert!(validate_update_download_url("").is_err());
        }
    }
}
