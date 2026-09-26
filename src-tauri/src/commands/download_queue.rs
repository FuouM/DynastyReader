//! Sequential chapter download processor (desktop).
//!
//! Reuses the exact `pageOutputPath` + `httpDownloadFull` + `setCachedPage`
//! path that `ReaderQueue` uses. Polite rate limiting (1500 ms inter-chapter),
//! WAL-safe SQLite writes via `spawn_blocking`, push progress via Tauri events.
//!
//! Phase 2 desktop-only — Android foreground service deferred to Phase 3.

use crate::util::{lock_unpoisoned, now_ms};
use log;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

/// Shared request timeout for chapter JSON and page image fetches (matches http.rs).
const FETCH_TIMEOUT_MS: u64 = 30_000;
/// Hard cap on a chapter JSON payload (typical Dynasty payload is ~250 KB).
const MAX_CHAPTER_JSON_BYTES: usize = 4 * 1024 * 1024;
/// Hard cap on a single page image (typical scans are a few MB).
const MAX_PAGE_BYTES: u64 = 64 * 1024 * 1024;

/// Per-page fetch retry budget: two retries with fixed backoff before the
/// whole chapter is failed.
const PAGE_RETRY_BACKOFF_MS: [u64; 2] = [500, 1500];

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
    pub bytes_done: u64,
    pub last_page_bytes: u64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnqueueResult {
    pub queued_count: usize,
    pub already_queued_count: usize,
}

/// Download scheduling / connection constraints pushed from the frontend via
/// `setDownloadConstraints`. Kept in-memory so the processor loop never has
/// to hit the DB to evaluate them.
///
/// Wi-Fi-only note: there is no reliable desktop metered-connection API
/// without extra dependencies, so desktop always reports `metered = false`
/// (unmetered). On Android the frontend reads `ConnectivityManager` via the
/// `AndroidThemeBridge.isConnectionMetered()` JS bridge and pushes the result
/// here.
#[derive(Debug, Clone, Default)]
pub struct DownloadConstraints {
    pub wifi_only: bool,
    pub metered: bool,
    pub schedule_enabled: bool,
    /// Window start, `"HH:mm"` local time.
    pub schedule_start: String,
    /// Window end, `"HH:mm"` local time.
    pub schedule_end: String,
    /// Minutes east of UTC (i.e. `-new Date().getTimezoneOffset()`), used to
    /// derive local time-of-day from the system clock without a chrono dep.
    pub tz_offset_minutes: i32,
}

pub struct DownloadState {
    pub paused: AtomicBool,
    pub notify: Notify,
    /// Per-chapter cancellation tokens.  A token is inserted when a chapter
    /// enters `downloading` state and removed when it completes or is
    /// cancelled.  `cancel_download` calls `.cancel()` on the matching token.
    pub cancel_map: Mutex<HashMap<String, CancellationToken>>,
    pub running: AtomicBool,
    pub constraints: Mutex<DownloadConstraints>,
}

impl Default for DownloadState {
    fn default() -> Self {
        Self {
            paused: AtomicBool::new(false),
            notify: Notify::new(),
            cancel_map: Mutex::new(HashMap::new()),
            running: AtomicBool::new(false),
            constraints: Mutex::new(DownloadConstraints::default()),
        }
    }
}


/// Directory (relative to the data root) that holds a chapter's downloaded
/// pages. Shared by `download_chapter` (writes) and the cancellation path
/// (prunes partial downloads).
fn chapter_pages_rel_dir(req: &DownloadRequest) -> String {
    let sanitize = |s: &str| s.replace(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_', "_");
    if req.chapter_permalink.starts_with("mdx:") {
        let clean_series = if req.series_permalink.is_empty() {
            "_singles".to_string()
        } else {
            sanitize(req.series_permalink.trim_start_matches("mdx:"))
        };
        let clean_chapter = sanitize(req.chapter_permalink.trim_start_matches("mdx:"));
        format!("mangadex/pages/{}/{}", clean_series, clean_chapter)
    } else {
        let clean_series = if req.series_permalink.is_empty() {
            "_singles".to_string()
        } else {
            sanitize(&req.series_permalink)
        };
        let clean_chapter = sanitize(&req.chapter_permalink);
        format!("pages/{}/{}", clean_series, clean_chapter)
    }
}

#[inline]
fn is_singles_series(sp: &str) -> bool {
    sp.is_empty() || sp == "_singles"
}

/// Resolves once downloads are paused. The notify waiter is registered before
/// the flag is re-checked so a pause landing between check and registration
/// is not lost.
async fn wait_until_paused(state: &DownloadState) {
    loop {
        if state.paused.load(Ordering::SeqCst) {
            return;
        }
        let notified = state.notify.notified();
        tokio::pin!(notified);
        notified.as_mut().enable();
        if state.paused.load(Ordering::SeqCst) {
            return;
        }
        notified.await;
    }
}

static RESET_STUCK_ONCE: std::sync::Once = std::sync::Once::new();

fn reset_stuck_downloads_once(conn: &rusqlite::Connection) {
    RESET_STUCK_ONCE.call_once(|| {
        let _ = conn.execute(
            "UPDATE download_queue SET status = 'pending' WHERE status = 'downloading'",
            [],
        );
    });
}

fn ensure_download_queue_table() -> Result<(), String> {
    let conn = crate::commands::db::open_synced(&crate::paths::db_path()).map_err(|e| format!("open db: {e}"))?;
    // busy_timeout/WAL/foreign_keys already applied by open_synced.
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
    // Reset stuck downloading rows to pending strictly once on boot,
    // never while downloads are actively running in flight.
    reset_stuck_downloads_once(&conn);
    Ok(())
}

fn ensure_processor_running(
    app: &AppHandle,
    state: &DownloadState,
    http_client: &reqwest::Client,
) {
    // Single-spawn invariant: only one caller may flip running false -> true.
    if state
        .running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        state.notify.notify_one();
        return;
    }
    let app_clone = app.clone();
    let client_clone = http_client.clone();
    tokio::spawn(async move {
        // Watchdog: run the processor in a child task so a panic is observed
        // here instead of orphaning the queue with `running` stuck true
        // (downloads would silently stall until app restart).
        let app2 = app_clone.clone();
        let client2 = client_clone.clone();
        let join = tokio::spawn(async move { run_processor(app2, client2).await });
        if let Err(e) = join.await {
            log::error!("download processor task panicked: {e}");
        }
        let state: State<DownloadState> = app_clone.state();
        state.running.store(false, Ordering::SeqCst);
        // Restart if pending work survived (e.g. panic mid-queue).
        let pending = tokio::task::spawn_blocking(|| {
            crate::commands::db::open_synced(&crate::paths::db_path())
                .and_then(|conn| {
                    conn.query_row(
                        "SELECT COUNT(*) FROM download_queue WHERE status = 'pending'",
                        [],
                        |row| row.get::<_, i64>(0),
                    )
                    .map_err(|e| format!("count pending: {e}"))
                })
                .unwrap_or(0)
        })
        .await
        .unwrap_or(0);
        if pending > 0 {
            log::warn!("download processor exited with {pending} pending rows; restarting");
            ensure_processor_running(&app_clone, &state, &client_clone);
        }
    });
}

#[tauri::command(rename = "enqueueChapters")]
pub async fn enqueue_chapters(
    app: AppHandle,
    state: State<'_, DownloadState>,
    http_state: State<'_, crate::commands::http::HttpState>,
    chapters: Vec<DownloadRequest>,
) -> Result<EnqueueResult, String> {
    let now = now_ms();
    let result = tokio::task::spawn_blocking(move || -> Result<EnqueueResult, String> {
        ensure_download_queue_table()?;
        let mut conn = crate::commands::db::open_synced(&crate::paths::db_path()).map_err(|e| format!("open db: {e}"))?;
        // busy_timeout/WAL/foreign_keys already applied by open_synced.
        // Single transaction: one fsync for the whole batch instead of one
        // per chapter.
        let tx = conn.transaction().map_err(|e| format!("begin tx: {e}"))?;
        let mut queued_count = 0usize;
        let mut already_queued_count = 0usize;
        for ch in &chapters {
            let inserted = tx
                .execute(
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
            if inserted > 0 {
                queued_count += 1;
                continue;
            }
            // Row exists: failed/cancelled rows are re-queued; rows that are
            // pending, downloading, or done count as already queued.
            let status: String = tx
                .query_row(
                    "SELECT status FROM download_queue WHERE chapter_permalink = ?1",
                    rusqlite::params![ch.chapter_permalink],
                    |row| row.get(0),
                )
                .map_err(|e| format!("enqueue status lookup failed: {e}"))?;
            if status == "failed" {
                tx.execute(
                    "UPDATE download_queue SET status = 'pending', error_msg = NULL, queued_at = ?1 WHERE chapter_permalink = ?2",
                    rusqlite::params![now, ch.chapter_permalink],
                )
                .map_err(|e| format!("enqueue requeue failed: {e}"))?;
                queued_count += 1;
            } else {
                already_queued_count += 1;
            }
        }
        tx.commit().map_err(|e| format!("commit tx: {e}"))?;
        Ok(EnqueueResult {
            queued_count,
            already_queued_count,
        })
    })
    .await
    .map_err(|e| format!("enqueue task failed: {e}"))??;

    // Wake processor if not running
    ensure_processor_running(&app, &state, &http_state.0);
    Ok(result)
}

#[tauri::command(rename = "pauseDownloads")]
pub async fn pause_downloads(state: State<'_, DownloadState>) -> Result<(), String> {
    state.paused.store(true, Ordering::SeqCst);
    // Wake mid-page fetch observers so pause aborts in-flight requests.
    state.notify.notify_waiters();
    Ok(())
}

#[tauri::command(rename = "resumeDownloads")]
pub async fn resume_downloads(
    app: AppHandle,
    state: State<'_, DownloadState>,
    http_state: State<'_, crate::commands::http::HttpState>,
) -> Result<(), String> {
    state.paused.store(false, Ordering::SeqCst);
    state.notify.notify_waiters();
    ensure_processor_running(&app, &state, &http_state.0);
    Ok(())
}

#[tauri::command(rename = "cancelDownload")]
pub async fn cancel_download(
    state: State<'_, DownloadState>,
    chapter_permalink: String,
) -> Result<(), String> {
    // Cancel the in-progress download (if any) for this chapter.
    let token = {
        let map = lock_unpoisoned(&state.cancel_map);
        map.get(&chapter_permalink).cloned()
    };
    if let Some(token) = token {
        token.cancel();
    }
    // Also mark queued pending rows as failed/cancelled
    let cp = chapter_permalink.clone();
    tokio::task::spawn_blocking(move || {
        if let Ok(conn) = crate::commands::db::open_synced(&crate::paths::db_path()) {
            let _ = conn.execute(
                "UPDATE download_queue SET status = 'failed', error_msg = 'cancelled' WHERE chapter_permalink = ?1 AND status = 'pending'",
                rusqlite::params![cp],
            );
        }
    })
    .await
    .ok();
    Ok(())
}

#[tauri::command(rename = "retryChapterDownload")]
pub async fn retry_chapter_download(
    app: AppHandle,
    state: State<'_, DownloadState>,
    http_state: State<'_, crate::commands::http::HttpState>,
    chapter_permalink: String,
) -> Result<(), String> {
    let cp = chapter_permalink.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = crate::commands::db::open_synced(&crate::paths::db_path()).map_err(|e| format!("open db: {e}"))?;
        let now = now_ms();
        let updated = conn
            .execute(
                "UPDATE download_queue SET status = 'pending', error_msg = NULL, queued_at = ?1 WHERE chapter_permalink = ?2 AND status = 'failed'",
                rusqlite::params![now, cp],
            )
            .map_err(|e| format!("retry chapter failed: {e}"))?;
        if updated == 0 {
            return Err("chapter is not in a failed state".to_string());
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("retry chapter task failed: {e}"))??;

    state.paused.store(false, Ordering::SeqCst);
    ensure_processor_running(&app, &state, &http_state.0);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(rename = "setDownloadConstraints")]
pub async fn set_download_constraints(
    app: AppHandle,
    state: State<'_, DownloadState>,
    http_state: State<'_, crate::commands::http::HttpState>,
    wifi_only: bool,
    metered: bool,
    schedule_enabled: bool,
    schedule_start: String,
    schedule_end: String,
    tz_offset_minutes: i32,
) -> Result<(), String> {
    {
        let mut c = lock_unpoisoned(&state.constraints);
        *c = DownloadConstraints {
            wifi_only,
            metered,
            schedule_enabled,
            schedule_start,
            schedule_end,
            tz_offset_minutes,
        };
    }
    // Wake a parked processor immediately so newly-allowed work resumes and
    // newly-blocked work is re-evaluated on the next loop iteration.
    state.notify.notify_waiters();
    ensure_processor_running(&app, &state, &http_state.0);
    Ok(())
}

#[tauri::command(rename = "retryFailedDownloads")]
pub async fn retry_failed_downloads(
    app: AppHandle,
    state: State<'_, DownloadState>,
    http_state: State<'_, crate::commands::http::HttpState>,
    series_permalink: String,
) -> Result<(), String> {
    let sp = series_permalink.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = crate::commands::db::open_synced(&crate::paths::db_path()).map_err(|e| format!("open db: {e}"))?;
        let now = now_ms();
        if is_singles_series(&sp) {
            conn.execute(
                "UPDATE download_queue SET status = 'pending', error_msg = NULL, queued_at = ?1 WHERE (series_permalink = '' OR series_permalink IS NULL OR series_permalink = '_singles') AND status = 'failed'",
                rusqlite::params![now],
            )
            .map_err(|e| format!("retry failed: {e}"))?;
        } else {
            conn.execute(
                "UPDATE download_queue SET status = 'pending', error_msg = NULL, queued_at = ?1 WHERE series_permalink = ?2 AND status = 'failed'",
                rusqlite::params![now, sp],
            )
            .map_err(|e| format!("retry failed: {e}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("retry task failed: {e}"))??;

    state.paused.store(false, Ordering::SeqCst);
    ensure_processor_running(&app, &state, &http_state.0);
    Ok(())
}

#[tauri::command(rename = "clearCompletedDownloads")]
pub async fn clear_completed_downloads(series_permalink: String) -> Result<(), String> {
    let sp = series_permalink.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = crate::commands::db::open_synced(&crate::paths::db_path()).map_err(|e| format!("open db: {e}"))?;
        if is_singles_series(&sp) {
            conn.execute(
                "DELETE FROM download_queue WHERE (series_permalink = '' OR series_permalink IS NULL OR series_permalink = '_singles') AND status IN ('done', 'failed', 'skipped')",
                [],
            )
            .map_err(|e| format!("clear failed: {e}"))?;
        } else {
            conn.execute(
                "DELETE FROM download_queue WHERE series_permalink = ?1 AND status IN ('done', 'failed', 'skipped')",
                rusqlite::params![sp],
            )
            .map_err(|e| format!("clear failed: {e}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("clear task failed: {e}"))??;
    Ok(())
}

#[tauri::command(rename = "getDownloadQueue")]
pub async fn get_download_queue(
    app: AppHandle,
    state: State<'_, DownloadState>,
    http_state: State<'_, crate::commands::http::HttpState>,
) -> Result<serde_json::Value, String> {
    let (items, has_pending) = tokio::task::spawn_blocking(|| -> Result<(Vec<serde_json::Value>, bool), String> {
        ensure_download_queue_table()?;
        let conn = crate::commands::db::open_synced(&crate::paths::db_path()).map_err(|e| format!("open db: {e}"))?;
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
        let mut has_pending_work = false;
        for r in rows {
            let val = r.map_err(|e| format!("row failed: {e}"))?;
            if let Some(status) = val.get("status").and_then(|s| s.as_str()) {
                if status == "pending" || status == "downloading" {
                    has_pending_work = true;
                }
            }
            out.push(val);
        }
        Ok((out, has_pending_work))
    })
    .await
    .map_err(|e| format!("get_download_queue failed: {e}"))??;

    if has_pending && !state.paused.load(Ordering::SeqCst) {
        ensure_processor_running(&app, &state, &http_state.0);
    }

    let is_paused = state.paused.load(Ordering::SeqCst);
    Ok(serde_json::json!({ "items": items, "paused": is_paused }))
}

/// Parses `"HH:mm"` into minutes since midnight; `None` when malformed.
fn parse_hhmm(s: &str) -> Option<i32> {
    let (h, m) = s.split_once(':')?;
    let h: i32 = h.trim().parse().ok()?;
    let m: i32 = m.trim().parse().ok()?;
    if !(0..24).contains(&h) || !(0..60).contains(&m) {
        return None;
    }
    Some(h * 60 + m)
}

/// Local time-of-day in minutes, derived from the system clock and the
/// frontend-pushed timezone offset.
fn local_minutes_of_day(tz_offset_minutes: i32) -> i32 {
    let epoch_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let local_mins = (epoch_secs / 60) + tz_offset_minutes as i64;
    local_mins.rem_euclid(1440) as i32
}

/// Whether the current constraints forbid starting the next chapter:
/// Wi-Fi-only on a metered connection, or outside the configured schedule
/// window (supports overnight windows where start > end).
fn constraints_blocked(state: &DownloadState) -> bool {
    let c = lock_unpoisoned(&state.constraints).clone();
    if c.wifi_only && c.metered {
        return true;
    }
    if c.schedule_enabled {
        if let (Some(start), Some(end)) = (parse_hhmm(&c.schedule_start), parse_hhmm(&c.schedule_end))
        {
            let now = local_minutes_of_day(c.tz_offset_minutes);
            let in_window = if start <= end {
                now >= start && now < end
            } else {
                now >= start || now < end
            };
            if !in_window {
                return true;
            }
        }
    }
    false
}

async fn run_processor(app: AppHandle, http_client: reqwest::Client) {
    let state: State<DownloadState> = app.state();
    // Ensure stuck rows are reset (blocking, so offload)
    let _ = tokio::task::spawn_blocking(ensure_download_queue_table)
        .await
        .unwrap_or(Ok(()));
    loop {
        // Pause gate
        if state.paused.load(Ordering::SeqCst) {
            state.notify.notified().await;
            continue;
        }

        // Constraint gate (QoL-D5): Wi-Fi-only on a metered connection or
        // outside the user schedule window. Park with a 60s poll; a settings
        // change wakes us early via `notify`.
        if constraints_blocked(&state) {
            tokio::select! {
                _ = state.notify.notified() => continue,
                _ = tokio::time::sleep(std::time::Duration::from_secs(60)) => continue,
            }
        }

        // Pick next pending row — run blocking DB work without holding
        // non-Send rusqlite types across an await.
        let next: Option<DownloadRequest> = tokio::task::spawn_blocking(|| {
            let conn = match crate::commands::db::open_synced(&crate::paths::db_path()) {
                Ok(c) => c,
                Err(_) => return None,
            };
            // busy_timeout/WAL/foreign_keys already applied by open_synced.
            conn.query_row(
                "SELECT series_permalink, series_title, chapter_permalink, chapter_title, chapter_index FROM download_queue WHERE status = 'pending' ORDER BY queued_at ASC LIMIT 1",
                [],
                |row| Ok(DownloadRequest {
                    series_permalink: row.get::<_, String>(0).unwrap_or_default(),
                    series_title: row.get::<_, String>(1).unwrap_or_default(),
                    chapter_permalink: row.get::<_, String>(2).unwrap_or_default(),
                    chapter_title: row.get::<_, String>(3).unwrap_or_default(),
                    chapter_index: row.get::<_, i64>(4).unwrap_or(0) as usize,
                }),
            ).ok()
        })
        .await
        .unwrap_or(None);

        // Handle DB open failures that would have been `continue` + sleep
        // inside the blocking closure: treat None as either "no work" or
        // transient error. For transient errors we still need a short backoff.
        // We distinguish by checking if there is actually a pending row via a
        // quick count — if None and we just failed to open, sleep 2s.
        // Simpler: if next is None, just go to the "no work" branch which
        // parks with a timeout. A spurious 30s wait on transient open failure
        // is acceptable (next enqueue will wake it via notify).

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

        // Mark downloading (blocking)
        let chapter_permalink = req.chapter_permalink.clone();
        let _ = tokio::task::spawn_blocking(move || {
            if let Ok(conn) = crate::commands::db::open_synced(&crate::paths::db_path()) {
                let _ = conn.execute(
                    "UPDATE download_queue SET status = 'downloading', progress = 0, total_pages = 0 WHERE chapter_permalink = ?1",
                    rusqlite::params![chapter_permalink],
                );
            }
        })
        .await;

        // Create a CancellationToken for this chapter and register it so
        // cancel_download can fire it from the command handler.
        let token = CancellationToken::new();
        {
            let mut map = lock_unpoisoned(&state.cancel_map);
            map.insert(req.chapter_permalink.clone(), token.clone());
        }

        let result = download_chapter(&app, &http_client, &req, &token).await;

        // Cleanup cancel map.
        {
            let mut map = lock_unpoisoned(&state.cancel_map);
            map.remove(&req.chapter_permalink);
        }

        // Update status (blocking)
        let now = now_ms();
        let req_clone = req.clone();
        let app_clone = app.clone();
        let (emit_status, pages_done, total_pages) = match result {
            Ok((done, total)) => {
                let _ = tokio::task::spawn_blocking(move || {
                    if let Ok(conn) = crate::commands::db::open_synced(&crate::paths::db_path()) {
                        let status = if done == total && total > 0 { "done" } else { "failed" };
                        let _ = conn.execute(
                            "UPDATE download_queue SET status = ?1, progress = ?2, total_pages = ?3, completed_at = ?4 WHERE chapter_permalink = ?5",
                            rusqlite::params![status, done as i64, total as i64, now, req_clone.chapter_permalink],
                        );
                    }
                })
                .await;
                ("done", done, total)
            }
            Err(e) if e == "cancelled" => {
                let cp = req.chapter_permalink.clone();
                let rel_dir = chapter_pages_rel_dir(&req);
                let _ = tokio::task::spawn_blocking(move || {
                    if let Ok(conn) = crate::commands::db::open_synced(&crate::paths::db_path()) {
                        let _ = conn.execute(
                            "UPDATE download_queue SET status = 'failed', error_msg = 'cancelled' WHERE chapter_permalink = ?1",
                            rusqlite::params![cp],
                        );
                        // Drop partial page rows so a re-enqueue starts clean.
                        let _ = conn.execute(
                            "DELETE FROM cached_pages WHERE chapter_permalink = ?1",
                            rusqlite::params![cp],
                        );
                    }
                    // Remove partially downloaded page files for this chapter.
                    if let Ok(dir) = crate::paths::resolve_in_root(&rel_dir) {
                        if dir.is_dir() {
                            let _ = std::fs::remove_dir_all(&dir);
                        }
                    }
                })
                .await;
                ("cancelled", 0, 0)
            }
            Err(e) => {
                let cp = req.chapter_permalink.clone();
                let err_msg = e.clone();
                let _ = tokio::task::spawn_blocking(move || {
                    if let Ok(conn) = crate::commands::db::open_synced(&crate::paths::db_path()) {
                        let _ = conn.execute(
                            "UPDATE download_queue SET status = 'failed', error_msg = ?1 WHERE chapter_permalink = ?2",
                            rusqlite::params![err_msg, cp],
                        );
                    }
                })
                .await;
                ("failed", 0, 0)
            }
        };
        let _ = app_clone.emit(
            "download://progress",
            DownloadProgressPayload {
                chapter_permalink: req.chapter_permalink.clone(),
                series_permalink: req.series_permalink.clone(),
                pages_done,
                total_pages,
                bytes_done: 0,
                last_page_bytes: 0,
                status: emit_status.to_string(),
            },
        );

        // Polite inter-chapter delay
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
    }
}

struct TempFileGuard(Option<std::path::PathBuf>);
impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if let Some(path) = self.0.take() {
            let _ = std::fs::remove_file(path);
        }
    }
}

async fn record_page_progress(
    chapter_permalink: &str,
    page_index: usize,
    file_path: &str,
    size_bytes: i64,
    progress: usize,
) {
    let cp = chapter_permalink.to_string();
    let fp = file_path.to_string();
    let is_mdx = cp.starts_with("mdx:");
    tokio::task::spawn_blocking(move || {
        if is_mdx {
            let mdx_path = crate::paths::data_root().join("mangadex.db");
            if let Ok(conn) = crate::commands::db::open_synced(&mdx_path) {
                let now = crate::util::now_ms();
                let ch_id = cp.trim_start_matches("mdx:");
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO cached_pages (chapter_id, page_index, file_path, size_bytes, cached_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![ch_id, page_index as i64, fp, size_bytes, now],
                );
            }
        } else if let Ok(conn) = crate::commands::db::open_synced(&crate::paths::db_path()) {
            let now = crate::util::now_ms();
            let _ = conn.execute(
                "INSERT OR REPLACE INTO cached_pages (chapter_permalink, page_index, file_path, size_bytes, cached_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![cp, page_index as i64, fp, size_bytes, now],
            );
        }
        if let Ok(conn) = crate::commands::db::open_synced(&crate::paths::db_path()) {
            let _ = conn.execute(
                "UPDATE download_queue SET progress = ?1 WHERE chapter_permalink = ?2",
                rusqlite::params![progress as i64, cp],
            );
        }
    })
    .await
    .ok();
}

async fn fetch_page_to_file(
    client: &reqwest::Client,
    abs_url: &str,
    target: &std::path::Path,
) -> Result<i64, String> {
    let is_mdx_network = abs_url.contains("mangadex.network");
    let start_time = std::time::Instant::now();
    if let Some(parent) = target.parent() {
        if let Err(e) = tokio::fs::create_dir_all(parent).await {
            let is_not_dir = e.raw_os_error() == Some(20) || e.to_string().contains("not a directory");
            if is_not_dir {
                let root = crate::paths::data_root();
                let mut cur = parent;
                while cur != root && cur != std::path::Path::new("") {
                    if cur.is_file() {
                        if crate::paths::is_protected_path(cur).unwrap_or(true) {
                            return Err(format!("cannot remove protected blocking path component: {cur:?}"));
                        }
                        log::warn!("removing blocking file in directory path: {:?}", cur);
                        let _ = std::fs::remove_file(cur);
                    }
                    if let Some(p) = cur.parent() {
                        cur = p;
                    } else {
                        break;
                    }
                }
                tokio::fs::create_dir_all(parent).await.map_err(|e2| format!("mkdir: {e2}"))?;
            } else {
                return Err(format!("mkdir: {e}"));
            }
        }
    }
    let resp = crate::commands::http::send_with_redirects(
        client,
        "GET",
        abs_url,
        None,
        None,
        None,
        Some(FETCH_TIMEOUT_MS),
    )
    .await
    .map_err(|e| {
        if is_mdx_network {
            let duration = start_time.elapsed().as_millis() as u64;
            let url_str = abs_url.to_string();
            let client_clone = client.clone();
            tokio::spawn(async move {
                let payload = serde_json::json!({
                    "url": url_str,
                    "success": false,
                    "bytes": 0,
                    "duration": duration,
                    "cached": false,
                });
                let _ = client_clone.post("https://api.mangadex.network/report").header(reqwest::header::CONTENT_TYPE, "application/json").body(payload.to_string()).send().await;
            });
        }
        format!("http get: {e}")
    })?;
    if !resp.status().is_success() {
        if is_mdx_network {
            let duration = start_time.elapsed().as_millis() as u64;
            let url_str = abs_url.to_string();
            let client_clone = client.clone();
            tokio::spawn(async move {
                let payload = serde_json::json!({
                    "url": url_str,
                    "success": false,
                    "bytes": 0,
                    "duration": duration,
                    "cached": false,
                });
                let _ = client_clone.post("https://api.mangadex.network/report").header(reqwest::header::CONTENT_TYPE, "application/json").body(payload.to_string()).send().await;
            });
        }
        return Err(format!("http status {}", resp.status()));
    }
    let parent = target.parent().unwrap_or(target);
    let tmp = tempfile::Builder::new()
        .prefix(".tmp-download-")
        .tempfile_in(parent)
        .map_err(|e| format!("tmp file: {e}"))?;
    let (std_file, tmp_path) = tmp
        .keep()
        .map_err(|e| format!("keep tmp file: {e}"))?;
    let mut guard = TempFileGuard(Some(tmp_path.clone()));
    let mut out = tokio::fs::File::from_std(std_file);
    let mut stream = resp.bytes_stream();
    let write_res = crate::commands::http::stream_to_file_capped(&mut stream, &mut out, MAX_PAGE_BYTES, |_| {}).await;
    drop(out);
    let size = match write_res {
        Ok(s) => s,
        Err(e) => {
            let e = if e.contains("exceeds size cap") {
                format!("page exceeds size cap of {MAX_PAGE_BYTES} bytes")
            } else {
                e
            };
            return Err(e);
        }
    };
    match tokio::fs::rename(&tmp_path, target).await {
        Ok(_) => {
            guard.0 = None;
            if is_mdx_network {
                let duration = start_time.elapsed().as_millis() as u64;
                let url_str = abs_url.to_string();
                let client_clone = client.clone();
                tokio::spawn(async move {
                    let payload = serde_json::json!({
                        "url": url_str,
                        "success": true,
                        "bytes": size,
                        "duration": duration,
                        "cached": false,
                    });
                    let _ = client_clone.post("https://api.mangadex.network/report").header(reqwest::header::CONTENT_TYPE, "application/json").body(payload.to_string()).send().await;
                });
            }
        }
        Err(e) => {
            return Err(format!("persist: {e}"));
        }
    }
    Ok(size as i64)
}

async fn fetch_and_cache_chapter_pages(
    client: &reqwest::Client,
    req: &DownloadRequest,
) -> Result<Vec<serde_json::Value>, String> {
    if req.chapter_permalink.starts_with("mdx:") {
        let chapter_id = req.chapter_permalink.trim_start_matches("mdx:");
        let at_home_url = format!("https://api.mangadex.org/at-home/server/{}", chapter_id);
        let resp = crate::commands::http::send_with_redirects(
            client,
            "GET",
            &at_home_url,
            None,
            None,
            None,
            Some(FETCH_TIMEOUT_MS),
        )
        .await
        .map_err(|e| format!("fetch mangadex at-home failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("fetch mangadex at-home status {}", resp.status()));
        }
        let body_bytes = crate::commands::http::read_body_capped(resp, MAX_CHAPTER_JSON_BYTES).await?;
        let v: serde_json::Value = serde_json::from_slice(&body_bytes).map_err(|e| format!("parse at-home: {e}"))?;
        let base_url = v.get("baseUrl").and_then(|b| b.as_str()).unwrap_or("");
        let chapter_obj = v.get("chapter");
        let hash = chapter_obj.and_then(|c| c.get("hash")).and_then(|h| h.as_str()).unwrap_or("");
        let filenames = chapter_obj
            .and_then(|c| c.get("dataSaver").or_else(|| c.get("data")))
            .and_then(|d| d.as_array())
            .cloned()
            .unwrap_or_default();

        let mut pages = Vec::new();
        for fn_val in filenames {
            if let Some(fn_str) = fn_val.as_str() {
                let page_url = format!("{}/data-saver/{}/{}", base_url, hash, fn_str);
                pages.push(serde_json::json!({
                    "url": page_url,
                }));
            }
        }
        return Ok(pages);
    }

    let chapter_url = format!("https://dynasty-scans.com/chapters/{}.json", req.chapter_permalink);
    let resp = crate::commands::http::send_with_redirects(
        client,
        "GET",
        &chapter_url,
        None,
        None,
        None,
        Some(FETCH_TIMEOUT_MS),
    )
    .await
    .map_err(|e| format!("fetch chapter failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("fetch chapter status {}", resp.status()));
    }
    let body_bytes = crate::commands::http::read_body_capped(resp, MAX_CHAPTER_JSON_BYTES).await?;
    let body = String::from_utf8_lossy(&body_bytes).into_owned();
    let v: serde_json::Value = serde_json::from_str(&body).map_err(|e| format!("parse chapter: {e}"))?;
    let pages = v
        .get("pages")
        .and_then(|p| p.as_array())
        .cloned()
        .unwrap_or_default();
    // Cache chapter metadata in DB (for BrowseDownloaded etc.)
    {
        let cp = req.chapter_permalink.clone();
        let body_clone = body.clone();
        tokio::task::spawn_blocking(move || {
            if let Ok(conn) = crate::commands::db::open_synced(&crate::paths::db_path()) {
                let now = crate::util::now_ms();
                let key = format!("chapter:{}", cp);
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO cached_metadata (cache_key, data_type, json_payload, cached_at) VALUES (?1, 'chapter', ?2, ?3)",
                    rusqlite::params![key, body_clone, now],
                );
            }
        })
        .await
        .ok();
    }

    let total = pages.len();
    if total == 0 {
        return Err("chapter has no pages".to_string());
    }

    // Update total_pages in queue
    {
        let cp = req.chapter_permalink.clone();
        tokio::task::spawn_blocking(move || {
            if let Ok(conn) = crate::commands::db::open_synced(&crate::paths::db_path()) {
                let _ = conn.execute(
                    "UPDATE download_queue SET total_pages = ?1 WHERE chapter_permalink = ?2",
                    rusqlite::params![total as i64, cp],
                );
            }
        })
        .await
        .ok();
    }

    Ok(pages)
}

async fn record_and_emit_page_progress(
    app: &AppHandle,
    req: &DownloadRequest,
    idx: usize,
    target_str: &str,
    size: i64,
    done: usize,
    total: usize,
    total_bytes_done: u64,
) {
    record_page_progress(&req.chapter_permalink, idx, target_str, size, done).await;
    let _ = app.emit(
        "download://progress",
        DownloadProgressPayload {
            chapter_permalink: req.chapter_permalink.clone(),
            series_permalink: req.series_permalink.clone(),
            pages_done: done,
            total_pages: total,
            bytes_done: total_bytes_done,
            last_page_bytes: size as u64,
            status: "downloading".to_string(),
        },
    );
}

async fn fetch_page_with_retries(
    client: &reqwest::Client,
    abs_url: &str,
    target: &std::path::Path,
    state: &DownloadState,
    cancel: &CancellationToken,
    idx: usize,
    total: usize,
    chapter_permalink: &str,
) -> Result<i64, String> {
    let mut attempt = 0usize;
    loop {
        let fetch_fut = fetch_page_to_file(client, abs_url, target);

        tokio::select! {
            r = fetch_fut => match r {
                Ok(size) => break Ok(size),
                Err(e) => {
                    if attempt >= PAGE_RETRY_BACKOFF_MS.len() {
                        break Err(e);
                    }
                    let backoff = PAGE_RETRY_BACKOFF_MS[attempt];
                    attempt += 1;
                    log::warn!(
                        "page {}/{} of {} failed ({e}); retrying in {backoff}ms",
                        idx + 1,
                        total,
                        chapter_permalink,
                    );
                    tokio::select! {
                        _ = tokio::time::sleep(std::time::Duration::from_millis(backoff)) => {}
                        _ = cancel.cancelled() => return Err("cancelled".to_string()),
                    }
                }
            },
            _ = cancel.cancelled() => return Err("cancelled".to_string()),
            // Pause aborts the in-flight fetch; the page restarts on resume.
            _ = wait_until_paused(state) => {
                while state.paused.load(Ordering::SeqCst) {
                    state.notify.notified().await;
                    if cancel.is_cancelled() {
                        return Err("cancelled".to_string());
                    }
                }
            }
        }
    }
}

async fn download_chapter(
    app: &AppHandle,
    client: &reqwest::Client,
    req: &DownloadRequest,
    cancel: &CancellationToken,
) -> Result<(usize, usize), String> {
    let pages = fetch_and_cache_chapter_pages(client, req).await?;
    let total = pages.len();
    let state: State<DownloadState> = app.state();
    let rel_dir = chapter_pages_rel_dir(req);
    let mut done = 0usize;
    let mut total_bytes_done = 0u64;
    for (idx, page) in pages.iter().enumerate() {
        // Check cancel
        if cancel.is_cancelled() {
            return Err("cancelled".to_string());
        }
        // Check pause (cooperative — wait while paused)
        while state.paused.load(Ordering::SeqCst) {
            state.notify.notified().await;
            if cancel.is_cancelled() {
                return Err("cancelled".to_string());
            }
        }

        let url = page.get("url").and_then(|u| u.as_str()).unwrap_or("");
        if url.is_empty() {
            // Server-side missing/stub page URL: count as processed so skipped empty pages
            // do not cause the chapter to fail and loop retries indefinitely.
            done += 1;
            let cp = req.chapter_permalink.clone();
            tokio::task::spawn_blocking(move || {
                if let Ok(conn) = crate::commands::db::open_synced(&crate::paths::db_path()) {
                    let _ = conn.execute(
                        "UPDATE download_queue SET progress = ?1 WHERE chapter_permalink = ?2",
                        rusqlite::params![done as i64, cp],
                    );
                }
            })
            .await
            .ok();
            continue;
        }
        let abs_url = if url.starts_with("http") {
            url.to_string()
        } else {
            format!("https://dynasty-scans.com{}", url)
        };

        // Compute output path like ReaderQueue: pages/<series>/<chapter>/page_0001.ext
        let raw_ext = abs_url
            .rsplit('.')
            .next()
            .and_then(|e| e.split('?').next())
            .unwrap_or("webp")
            .to_ascii_lowercase();
        let ext = if ["webp", "jpg", "jpeg", "png", "gif", "avif", "bmp"].contains(&raw_ext.as_str()) {
            raw_ext.as_str()
        } else {
            "webp"
        };
        let pad = format!("{:04}", idx + 1);
        let rel_path = format!("{}/page_{}.{}", rel_dir, pad, ext);
        // Skip if already exists and non-empty (resume safety)
        let target = crate::paths::resolve_in_root(&rel_path).map_err(|e| format!("resolve path: {e}"))?;
        if target.is_file() {
            if let Ok(meta) = std::fs::metadata(&target) {
                if meta.len() > 0 {
                    // Register in cached_pages if not already and update progress in single DB connection
                    let abs_str = target.to_string_lossy().into_owned();
                    let size = meta.len() as i64;
                    done += 1;
                    total_bytes_done += size as u64;
                    record_and_emit_page_progress(app, req, idx, &abs_str, size, done, total, total_bytes_done).await;
                    continue;
                }
            }
        }

        let page_size = fetch_page_with_retries(
            client,
            &abs_url,
            &target,
            &state,
            cancel,
            idx,
            total,
            &req.chapter_permalink,
        )
        .await?;

        done += 1;
        total_bytes_done += page_size as u64;
        let abs_clone = target.to_string_lossy().into_owned();
        record_and_emit_page_progress(app, req, idx, &abs_clone, page_size, done, total, total_bytes_done).await;
    }

    Ok((done, total))
}
