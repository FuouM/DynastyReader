//! In-app updater for standalone portable binary distribution.
//!
//! Checks the latest GitHub release of DynastyReader, compares SemVer,
//! downloads the updated executable, and performs atomic replacement on Windows.

use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

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

/// Helper to parse semver strings like "0.1.0" or "v0.2.1" into (major, minor, patch)
fn parse_version(v: &str) -> Option<(u32, u32, u32)> {
    let clean = v.trim().trim_start_matches('v');
    let parts: Vec<&str> = clean.split('.').collect();
    if parts.len() < 3 {
        return None;
    }
    let major = parts[0].parse::<u32>().ok()?;
    let minor = parts[1].parse::<u32>().ok()?;
    let patch = parts[2].split('-').next()?.parse::<u32>().ok()?;
    Some((major, minor, patch))
}

fn is_version_newer(latest: &str, current: &str) -> bool {
    match (parse_version(latest), parse_version(current)) {
        (Some(l), Some(c)) => l > c,
        _ => latest != current && !latest.is_empty(),
    }
}

/// Checks the official GitHub repository for new releases.
#[tauri::command(rename = "checkForUpdates")]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();

    let client = reqwest::Client::builder()
        .user_agent("DynastyReader-Updater")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .get("https://api.github.com/repos/FuouM/DynastyReader/releases/latest")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Failed to query GitHub releases: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned HTTP {}", resp.status()));
    }

    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;

    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse GitHub release response: {e}"))?;

    let tag_name = json["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    let release_notes = json["body"].as_str().unwrap_or("").to_string();

    let mut download_url = String::new();
    let mut asset_size = 0u64;

    #[cfg(target_os = "windows")]
    let target_ext = ".exe";
    #[cfg(target_os = "linux")]
    let target_ext = ".AppImage";
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    let target_ext = "";

    if let Some(assets) = json["assets"].as_array() {
        for asset in assets {
            let name = asset["name"].as_str().unwrap_or("");
            if !target_ext.is_empty() && name.ends_with(target_ext) {
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
pub async fn install_update(app: AppHandle, download_url: String) -> Result<(), String> {
    if download_url.is_empty() {
        return Err("Download URL cannot be empty".to_string());
    }

    let current_exe = env::current_exe().map_err(|e| format!("Cannot locate current executable: {e}"))?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| "Cannot determine executable directory".to_string())?;

    let file_name = current_exe
        .file_name()
        .ok_or_else(|| "Cannot determine executable filename".to_string())?;

    let new_exe: PathBuf = exe_dir.join(format!("{}.new", file_name.to_string_lossy()));
    let old_exe: PathBuf = exe_dir.join(format!("{}.old", file_name.to_string_lossy()));

    log::info!("Downloading update from: {download_url}");
    log::info!("Target temporary binary: {}", new_exe.display());

    let client = reqwest::Client::builder()
        .user_agent("DynastyReader-Updater")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    use tokio::io::AsyncWriteExt;
    use tokio_stream::StreamExt;

    let mut file = tokio::fs::File::create(&new_exe)
        .await
        .map_err(|e| format!("Failed to create temporary update file: {e}"))?;

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Error downloading chunk: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write chunk to file: {e}"))?;
        downloaded += chunk.len() as u64;

        let percentage = if total_size > 0 {
            (downloaded as f64 / total_size as f64) * 100.0
        } else {
            0.0
        };

        let _ = app.emit(
            "update-progress",
            DownloadProgress {
                downloaded_bytes: downloaded,
                total_bytes: total_size,
                percentage,
            },
        );
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to finalize update file: {e}"))?;
    drop(file);

    log::info!("Download complete ({downloaded} bytes). Applying self-replacement...");

    #[cfg(target_os = "windows")]
    {
        // 1. Remove previous leftover .old if present
        if old_exe.exists() {
            let _ = fs::remove_file(&old_exe);
        }

        // 2. Windows allows renaming a running binary
        fs::rename(&current_exe, &old_exe)
            .map_err(|e| format!("Failed to move running executable to .old: {e}"))?;

        // 3. Move .new into current_exe
        if let Err(e) = fs::rename(&new_exe, &current_exe) {
            // Rollback if renaming new exe failed
            let _ = fs::rename(&old_exe, &current_exe);
            return Err(format!("Failed to activate new executable: {e}"));
        }

        // 4. Launch the new executable and exit current process
        log::info!("Launching updated binary: {}", current_exe.display());
        std::process::Command::new(&current_exe)
            .spawn()
            .map_err(|e| format!("Failed to launch updated binary: {e}"))?;

        std::process::exit(0);
    }

    #[cfg(not(target_os = "windows"))]
    {
        // For Unix / AppImage
        #[cfg(target_family = "unix")]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&new_exe, fs::Permissions::from_mode(0o755));
        }

        if old_exe.exists() {
            let _ = fs::remove_file(&old_exe);
        }
        fs::rename(&current_exe, &old_exe)
            .map_err(|e| format!("Failed to backup executable: {e}"))?;
        fs::rename(&new_exe, &current_exe)
            .map_err(|e| format!("Failed to activate new executable: {e}"))?;

        std::process::Command::new(&current_exe)
            .spawn()
            .map_err(|e| format!("Failed to launch updated binary: {e}"))?;

        std::process::exit(0);
    }
}

/// Cleans up any `.old` and `.new` leftover binary files in the executable directory on startup.
pub fn cleanup_old_executables() {
    if let Ok(current_exe) = env::current_exe() {
        if let Some(dir) = current_exe.parent() {
            if let Some(file_name) = current_exe.file_name() {
                let old_exe = dir.join(format!("{}.old", file_name.to_string_lossy()));
                if old_exe.exists() {
                    let _ = fs::remove_file(old_exe);
                }
                let new_exe = dir.join(format!("{}.new", file_name.to_string_lossy()));
                if new_exe.exists() {
                    let _ = fs::remove_file(new_exe);
                }
            }
        }
    }
}
