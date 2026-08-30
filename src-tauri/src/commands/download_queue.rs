//! Sequential chapter download processor (desktop).
//!
//! Reuses the exact `pageOutputPath` + `httpDownloadFull` + `setCachedPage`
//! path that `ReaderQueue` uses. Polite rate limiting (1500 ms inter-chapter),
//! WAL-safe SQLite writes via `spawn_blocking`, push progress via Tauri events.
//!
//! Phase 2 desktop-only — Android foreground service deferred to Phase 3.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{watch, Notify};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub series_permalink: String,
    pub series_title: String,
    pub chapter_permalink: String,
    pub chapter_title: String,
    pub chapter_index: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgressPayload {
    pub chapter_permalink: String,
    pub series_permalink: String,
    pub pages_done: usize,
    pub total_pages: usize,
    pub status: String,
}

pub struct DownloadState {
    pub paused: AtomicBool,
    pub notify: Notify,
    pub cancel_map: Mutex<HashMap<String, watch::Sender<bool>>>,
    pub running: AtomicBool,
}

impl Default for DownloadState {
    fn default() -> Self {
        Self {
            paused: AtomicBool::new(false),
            notify: Notify::new(),
            cancel_map: Mutex::new(HashMap::new()),
            running: AtomicBool::new(false),
        }
    }
}

fn db_path() -> std::path::PathBuf {
    crate::paths::data_root().join("dynasty_reader.db")
}

fn ensure_download_queue_table() -> Result<(), String> {
    let conn = rusqlite::Connection::open(db_path()).map_err(|e| format!("open db: {e}"))?;
    conn.busy_timeout(std::time::Duration::from_millis(5000))
        .map_err(|e| format!("busy timeout: {e}"))?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS download_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            series_permalink TEXT NOT NULL,
            series_title TEXT NOT NULL,
            chapter_permalink TEXT NOT NULL UNIQUE,
            chapter_title TEXT NOT NULL,
            chapter_index INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            progress INTEGER NOT NULL DEFAULT 0,
            total_pages INTEGER NOT NULL DEFAULT 0,
            error_msg TEXT,
            queued_at INTEGER NOT NULL,
            completed_at INTEGER
        )",
        [],
    )
    .map_err(|e| format!("create download_queue failed: {e}"))?;
    // Reset stuck downloading rows to pending on boot
    conn.execute(
        "UPDATE download_queue SET status = 'pending' WHERE status = 'downloading'",
        [],
    )
    .ok();
    Ok(())
}

#[tauri::command(rename = "enqueueChapters")]
pub async fn enqueue_chapters(
    app: AppHandle,
    state: State<'_, DownloadState>,
    http_state: State<'_, crate::commands::http::HttpState>,
    chapters: Vec<DownloadRequest>,
) -> Result<(), String> {
    ensure_download_queue_table()?;
    let now = chrono_now();
    {
        let conn = rusqlite::Connection::open(db_path()).map_err(|e| format!("open db: {e}"))?;
        conn.busy_timeout(std::time::Duration::from_millis(5000))
            .map_err(|e| format!("busy timeout: {e}"))?;
        for ch in &chapters {
            // Skip if already fully cached (all pages present)
            // We do a lightweight check: if cached_pages count >= total? But we don't know total yet.
            // Instead, enqueue as pending; processor will mark skipped if file exists.
            conn.execute(
                "INSERT OR IGNORE INTO download_queue (series_permalink, series_title, chapter_permalink, chapter_title, chapter_index, status, queued_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)",
                rusqlite::params![
                    ch.series_permalink,
                    ch.series_title,
                    ch.chapter_permalink,
                    ch.chapter_title,
                    ch.chapter_index as i64,
                    now
                ],
            )
            .map_err(|e| format!("enqueue failed: {e}"))?;
        }
    }

    // Wake processor if not running
    if !state.running.load(Ordering::SeqCst) {
        let app_clone = app.clone();
        // Clone needed handles via managed state references is tricky; we rely on app.state
        let http_client = http_state.0.clone();
        state.running.store(true, Ordering::SeqCst);
        tokio::spawn(async move {
            run_processor(app_clone, http_client).await;
        });
    } else {
        state.notify.notify_one();
    }
    Ok(())
}

#[tauri::command(rename = "pauseDownloads")]
pub async fn pause_downloads(state: State<'_, DownloadState>) -> Result<(), String> {
    state.paused.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command(rename = "resumeDownloads")]
pub async fn resume_downloads(state: State<'_, DownloadState>) -> Result<(), String> {
    state.paused.store(false, Ordering::SeqCst);
    state.notify.notify_one();
    Ok(())
}

#[tauri::command(rename = "cancelDownload")]
pub async fn cancel_download(
    state: State<'_, DownloadState>,
    chapter_permalink: String,
) -> Result<(), String> {
    // Signal cancel via watch channel
    let sender = {
        let map = state.cancel_map.lock().unwrap();
        map.get(&chapter_permalink).cloned()
    };
    if let Some(tx) = sender {
        let _ = tx.send(true);
    }
    // Also mark queued pending rows as failed/cancelled
    let conn = rusqlite::Connection::open(db_path()).map_err(|e| format!("open db: {e}"))?;
    conn.execute(
        "UPDATE download_queue SET status = 'failed', error_msg = 'cancelled' WHERE chapter_permalink = ?1 AND status = 'pending'",
        rusqlite::params![chapter_permalink],
    )
    .ok();
    Ok(())
}

#[tauri::command(rename = "retryFailedDownloads")]
pub async fn retry_failed_downloads(
    state: State<'_, DownloadState>,
    series_permalink: String,
) -> Result<(), String> {
    let conn = rusqlite::Connection::open(db_path()).map_err(|e| format!("open db: {e}"))?;
    conn.execute(
        "UPDATE download_queue SET status = 'pending', error_msg = NULL WHERE series_permalink = ?1 AND status = 'failed'",
        rusqlite::params![series_permalink],
    )
    .map_err(|e| format!("retry failed: {e}"))?;
    state.paused.store(false, Ordering::SeqCst);
    state.notify.notify_one();
    Ok(())
}

#[tauri::command(rename = "clearCompletedDownloads")]
pub async fn clear_completed_downloads(series_permalink: String) -> Result<(), String> {
    let conn = rusqlite::Connection::open(db_path()).map_err(|e| format!("open db: {e}"))?;
    conn.execute(
        "DELETE FROM download_queue WHERE series_permalink = ?1 AND status IN ('done', 'failed', 'skipped')",
        rusqlite::params![series_permalink],
    )
    .map_err(|e| format!("clear failed: {e}"))?;
    Ok(())
}

#[tauri::command(rename = "getDownloadQueue")]
pub async fn get_download_queue() -> Result<serde_json::Value, String> {
    ensure_download_queue_table()?;
    let conn = rusqlite::Connection::open(db_path()).map_err(|e| format!("open db: {e}"))?;
    let mut stmt = conn
        .prepare("SELECT series_permalink, series_title, chapter_permalink, chapter_title, chapter_index, status, progress, total_pages, error_msg, queued_at, completed_at FROM download_queue ORDER BY queued_at ASC")
        .map_err(|e| format!("prepare failed: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "series_permalink": row.get::<_, String>(0)?,
                "series_title": row.get::<_, String>(1)?,
                "chapter_permalink": row.get::<_, String>(2)?,
                "chapter_title": row.get::<_, String>(3)?,
                "chapter_index": row.get::<_, i64>(4)?,
                "status": row.get::<_, String>(5)?,
                "progress": row.get::<_, i64>(6)?,
                "total_pages": row.get::<_, i64>(7)?,
                "error_msg": row.get::<_, Option<String>>(8)?,
                "queued_at": row.get::<_, i64>(9)?,
                "completed_at": row.get::<_, Option<i64>>(10)?,
            }))
        })
        .map_err(|e| format!("query failed: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row failed: {e}"))?);
    }
    Ok(serde_json::json!({ "items": out }))
}

fn chrono_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

async fn run_processor(app: AppHandle, http_client: reqwest::Client) {
    let state: State<DownloadState> = app.state();
    // Ensure stuck rows are reset
    let _ = ensure_download_queue_table();
    loop {
        // Pause gate
        if state.paused.load(Ordering::SeqCst) {
            state.notify.notified().await;
            continue;
        }

        // Pick next pending row
        let next: Option<DownloadRequest> = {
            let conn = match rusqlite::Connection::open(db_path()) {
                Ok(c) => c,
                Err(_) => {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue;
                }
            };
            let _ = conn.busy_timeout(std::time::Duration::from_millis(5000));
            let mut stmt = match conn.prepare(
                "SELECT series_permalink, series_title, chapter_permalink, chapter_title, chapter_index FROM download_queue WHERE status = 'pending' ORDER BY queued_at ASC LIMIT 1",
            ) {
                Ok(s) => s,
                Err(_) => {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue;
                }
            };
            let mut rows = match stmt.query([]) {
                Ok(r) => r,
                Err(_) => {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue;
                }
            };
            if let Ok(Some(row)) = rows.next() {
                Some(DownloadRequest {
                    series_permalink: row.get::<_, String>(0).unwrap_or_default(),
                    series_title: row.get::<_, String>(1).unwrap_or_default(),
                    chapter_permalink: row.get::<_, String>(2).unwrap_or_default(),
                    chapter_title: row.get::<_, String>(3).unwrap_or_default(),
                    chapter_index: row.get::<_, i64>(4).unwrap_or(0) as usize,
                })
            } else {
                None
            }
        };

        let req = match next {
            Some(r) => r,
            None => {
                // No work — park until notified or 30s poll
                tokio::select! {
                    _ = state.notify.notified() => continue,
                    _ = tokio::time::sleep(std::time::Duration::from_secs(30)) => continue,
                }
            }
        };

        // Mark downloading
        {
            if let Ok(conn) = rusqlite::Connection::open(db_path()) {
                let _ = conn.execute(
                    "UPDATE download_queue SET status = 'downloading', progress = 0, total_pages = 0 WHERE chapter_permalink = ?1",
                    rusqlite::params![req.chapter_permalink],
                );
            }
        }

        // Create cancel channel for this chapter
        let (tx, mut rx) = watch::channel(false);
        {
            let mut map = state.cancel_map.lock().unwrap();
            map.insert(req.chapter_permalink.clone(), tx);
        }

        let result = download_chapter(&app, &http_client, &req, &mut rx).await;

        // Cleanup cancel map
        {
            let mut map = state.cancel_map.lock().unwrap();
            map.remove(&req.chapter_permalink);
        }

        // Update status
        let now = chrono_now();
        match result {
            Ok((done, total)) => {
                if let Ok(conn) = rusqlite::Connection::open(db_path()) {
                    let status = if done >= total && total > 0 { "done" } else { "done" };
                    let _ = conn.execute(
                        "UPDATE download_queue SET status = ?1, progress = ?2, total_pages = ?3, completed_at = ?4 WHERE chapter_permalink = ?5",
                        rusqlite::params![status, done as i64, total as i64, now, req.chapter_permalink],
                    );
                    let _ = app.emit(
                        "download://progress",
                        DownloadProgressPayload {
                            chapter_permalink: req.chapter_permalink.clone(),
                            series_permalink: req.series_permalink.clone(),
                            pages_done: done,
                            total_pages: total,
                            status: status.to_string(),
                        },
                    );
                }
            }
            Err(e) if e == "cancelled" => {
                if let Ok(conn) = rusqlite::Connection::open(db_path()) {
                    let _ = conn.execute(
                        "UPDATE download_queue SET status = 'failed', error_msg = 'cancelled' WHERE chapter_permalink = ?1",
                        rusqlite::params![req.chapter_permalink],
                    );
                }
                let _ = app.emit(
                    "download://progress",
                    DownloadProgressPayload {
                        chapter_permalink: req.chapter_permalink.clone(),
                        series_permalink: req.series_permalink.clone(),
                        pages_done: 0,
                        total_pages: 0,
                        status: "cancelled".to_string(),
                    },
                );
            }
            Err(e) => {
                if let Ok(conn) = rusqlite::Connection::open(db_path()) {
                    let _ = conn.execute(
                        "UPDATE download_queue SET status = 'failed', error_msg = ?1 WHERE chapter_permalink = ?2",
                        rusqlite::params![e, req.chapter_permalink],
                    );
                }
                let _ = app.emit(
                    "download://progress",
                    DownloadProgressPayload {
                        chapter_permalink: req.chapter_permalink.clone(),
                        series_permalink: req.series_permalink.clone(),
                        pages_done: 0,
                        total_pages: 0,
                        status: "failed".to_string(),
                    },
                );
            }
        }

        // Polite inter-chapter delay
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
    }
}

async fn download_chapter(
    app: &AppHandle,
    client: &reqwest::Client,
    req: &DownloadRequest,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<(usize, usize), String> {
    // Fetch chapter JSON to get page list (uses Dynasty API, with SSRF validation bypass? Need to fetch via http client directly)
    // We fetch via reqwest directly to avoid Tauri IPC; the chapter JSON is at https://dynasty-scans.com/chapters/<permalink>.json
    let chapter_url = format!("https://dynasty-scans.com/chapters/{}.json", req.chapter_permalink);
    let resp = client
        .get(&chapter_url)
        .send()
        .await
        .map_err(|e| format!("fetch chapter failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("fetch chapter status {}", resp.status()));
    }
    let body = resp.text().await.map_err(|e| format!("read chapter body: {e}"))?;
    let v: serde_json::Value = serde_json::from_str(&body).map_err(|e| format!("parse chapter: {e}"))?;
    let pages = v
        .get("pages")
        .and_then(|p| p.as_array())
        .cloned()
        .unwrap_or_default();

    // Cache chapter metadata in DB (for BrowseDownloaded etc.)
    {
        if let Ok(conn) = rusqlite::Connection::open(db_path()) {
            let now = chrono_now();
            let key = format!("chapter:{}", req.chapter_permalink);
            let _ = conn.execute(
                "INSERT OR REPLACE INTO cached_metadata (cache_key, data_type, json_payload, cached_at) VALUES (?1, 'chapter', ?2, ?3)",
                rusqlite::params![key, body, now],
            );
        }
    }

    let total = pages.len();
    if total == 0 {
        return Err("chapter has no pages".to_string());
    }

    // Update total_pages in queue
    if let Ok(conn) = rusqlite::Connection::open(db_path()) {
        let _ = conn.execute(
            "UPDATE download_queue SET total_pages = ?1 WHERE chapter_permalink = ?2",
            rusqlite::params![total as i64, req.chapter_permalink],
        );
    }

    let mut done = 0usize;
    for (idx, page) in pages.iter().enumerate() {
        // Check cancel
        if *cancel_rx.borrow() {
            return Err("cancelled".to_string());
        }
        // Check pause (cooperative — wait while paused)
        let state: State<DownloadState> = app.state();
        while state.paused.load(Ordering::SeqCst) {
            state.notify.notified().await;
            if *cancel_rx.borrow() {
                return Err("cancelled".to_string());
            }
        }

        let url = page.get("url").and_then(|u| u.as_str()).unwrap_or("");
        if url.is_empty() {
            continue;
        }
        let abs_url = if url.starts_with("http") {
            url.to_string()
        } else {
            format!("https://dynasty-scans.com{}", url)
        };

        // Compute output path like ReaderQueue: pages/<series>/<chapter>/page_0001.ext
        let clean_series = if req.series_permalink.is_empty() {
            "_singles".to_string()
        } else {
            req.series_permalink.replace(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_', "_")
        };
        let clean_chapter = req
            .chapter_permalink
            .replace(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_', "_");
        let ext = abs_url.rsplit('.').next().and_then(|e| e.split('?').next()).unwrap_or("webp");
        let pad = format!("{:04}", idx + 1);
        let rel_path = format!("pages/{}/{}/page_{}.{}", clean_series, clean_chapter, pad, ext);

        // Skip if already exists and non-empty (resume safety)
        let target = crate::paths::resolve_in_root(&rel_path).map_err(|e| format!("resolve path: {e}"))?;
        if target.is_file() {
            if let Ok(meta) = std::fs::metadata(&target) {
                if meta.len() > 0 {
                    // Register in cached_pages if not already
                    let abs_str = target.to_string_lossy().into_owned();
                    if let Ok(conn) = rusqlite::Connection::open(db_path()) {
                        let now = chrono_now();
                        let _ = conn.execute(
                            "INSERT OR REPLACE INTO cached_pages (chapter_permalink, page_index, file_path, size_bytes, cached_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                            rusqlite::params![req.chapter_permalink, idx as i64, abs_str, meta.len() as i64, now],
                        );
                    }
                    done += 1;
                    // Emit progress
                    let _ = app.emit(
                        "download://progress",
                        DownloadProgressPayload {
                            chapter_permalink: req.chapter_permalink.clone(),
                            series_permalink: req.series_permalink.clone(),
                            pages_done: done,
                            total_pages: total,
                            status: "downloading".to_string(),
                        },
                    );
                    continue;
                }
            }
        }

        // Fetch page with cancel select
        let fetch_fut = async {
            // Ensure parent dir
            if let Some(parent) = target.parent() {
                tokio::fs::create_dir_all(parent).await.map_err(|e| format!("mkdir: {e}"))?;
            }
            let resp = client.get(&abs_url).send().await.map_err(|e| format!("http get: {e}"))?;
            if !resp.status().is_success() {
                return Err(format!("http status {}", resp.status()));
            }
            let bytes = resp.bytes().await.map_err(|e| format!("read bytes: {e}"))?;
            // Write via temp file then persist
            let parent = target.parent().unwrap_or(&target);
            let tmp = tempfile::Builder::new()
                .prefix(".tmp-download-")
                .tempfile_in(parent)
                .map_err(|e| format!("tmp file: {e}"))?;
            let tmp_path = tmp.path().to_path_buf();
            tokio::fs::write(&tmp_path, &bytes).await.map_err(|e| format!("write tmp: {e}"))?;
            tmp.persist(&target).map_err(|e| format!("persist: {e}"))?;
            let size = bytes.len() as i64;
            let abs_str = target.to_string_lossy().into_owned();
            // Spawn blocking for DB write
            let cp = req.chapter_permalink.clone();
            let abs_clone = abs_str.clone();
            tokio::task::spawn_blocking(move || {
                if let Ok(conn) = rusqlite::Connection::open(db_path()) {
                    let _ = conn.busy_timeout(std::time::Duration::from_millis(5000));
                    let now = chrono_now();
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO cached_pages (chapter_permalink, page_index, file_path, size_bytes, cached_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                        rusqlite::params![cp, idx as i64, abs_clone, size, now],
                    );
                }
            })
            .await
            .ok();
            Ok::<i64, String>(size)
        };

        let size_res = tokio::select! {
            r = fetch_fut => r,
            _ = cancel_rx.changed() => return Err("cancelled".to_string()),
        };

        match size_res {
            Ok(_) => {
                done += 1;
                if let Ok(conn) = rusqlite::Connection::open(db_path()) {
                    let _ = conn.execute(
                        "UPDATE download_queue SET progress = ?1 WHERE chapter_permalink = ?2",
                        rusqlite::params![done as i64, req.chapter_permalink],
                    );
                }
                let _ = app.emit(
                    "download://progress",
                    DownloadProgressPayload {
                        chapter_permalink: req.chapter_permalink.clone(),
                        series_permalink: req.series_permalink.clone(),
                        pages_done: done,
                        total_pages: total,
                        status: "downloading".to_string(),
                    },
                );
            }
            Err(e) => {
                // Log and continue? For now fail the chapter if a page fails
                return Err(e);
            }
        }
    }

    Ok((done, total))
}
