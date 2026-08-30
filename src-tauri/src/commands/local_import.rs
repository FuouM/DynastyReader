//! CBZ / local archive import pipeline.
//!
//! Desktop-only: unpacks `.cbz` / `.zip` archives into
//! `.data/local/<series-slug>/chapters/<chapter-slug>/pNNN.jpg` and
//! registers `local:` permalinks in SQLite + cache rows. All blocking
//! work (zip scan, extraction, image encode) runs on `spawn_blocking`.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp"];
const SKIP_PREFIXES: &[&str] = &["__macosx", "__MACOSX"];
const SKIP_FILES: &[&str] = &["thumbs.db", ".ds_store", "comicinfo.xml"];

fn is_image(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with('/') {
        return false;
    }
    let ext = lower.rsplit('.').next().unwrap_or("");
    IMAGE_EXTS.contains(&ext)
}

fn should_skip(entry: &str) -> bool {
    let lower = entry.to_ascii_lowercase();
    for pref in SKIP_PREFIXES {
        if lower.starts_with(&pref.to_ascii_lowercase()) {
            return true;
        }
    }
    let base = lower.rsplit('/').next().unwrap_or(&lower);
    if SKIP_FILES.contains(&base) {
        // ComicInfo.xml is skipped for image collection but parsed separately
        // — we still don't want it counted as a page.
        return true;
    }
    // Hidden files
    if base.starts_with('.') {
        return true;
    }
    false
}

fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut last_dash = true;
    for ch in input.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "local".to_string()
    } else {
        trimmed
    }
}

/// Natural sort key: split into (text, number) chunks for human ordering.
fn natural_key(s: &str) -> Vec<NaturalChunk> {
    let mut chunks = Vec::new();
    let mut cur = String::new();
    let mut in_digit = false;
    for ch in s.chars() {
        let is_digit = ch.is_ascii_digit();
        if cur.is_empty() {
            cur.push(ch);
            in_digit = is_digit;
        } else if is_digit == in_digit {
            cur.push(ch);
        } else {
            if in_digit {
                chunks.push(NaturalChunk::Num(cur.parse::<u64>().unwrap_or(0)));
            } else {
                chunks.push(NaturalChunk::Str(cur.to_ascii_lowercase()));
            }
            cur = ch.to_string();
            in_digit = is_digit;
        }
    }
    if !cur.is_empty() {
        if in_digit {
            chunks.push(NaturalChunk::Num(cur.parse::<u64>().unwrap_or(0)));
        } else {
            chunks.push(NaturalChunk::Str(cur.to_ascii_lowercase()));
        }
    }
    chunks
}

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
enum NaturalChunk {
    Num(u64),
    Str(String),
}

fn natural_sort(paths: &mut [String]) {
    paths.sort_by(|a, b| natural_key(a).cmp(&natural_key(b)));
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveScanChapter {
    pub title: String,
    pub page_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveScanResult {
    pub file_name: String,
    pub series_title: String,
    pub chapters: Vec<ArchiveScanChapter>,
    pub total_pages: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalSeriesMeta {
    pub title: String,
    pub author: Option<String>,
    pub description: Option<String>,
}

fn collect_image_entries(zip_path: &Path) -> Result<Vec<String>, String> {
    let file = std::fs::File::open(zip_path).map_err(|e| format!("failed opening archive: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("invalid zip archive: {e}"))?;
    let mut entries = Vec::new();
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| format!("zip entry error: {e}"))?;
        let name = entry.name().to_string();
        if should_skip(&name) {
            continue;
        }
        if is_image(&name) {
            entries.push(name);
        }
    }
    Ok(entries)
}

fn group_entries(entries: Vec<String>) -> Vec<(String, Vec<String>)> {
    if entries.is_empty() {
        return vec![];
    }
    // Detect top-level subdirectory grouping
    let mut top_levels: HashSet<String> = HashSet::new();
    let mut has_root_files = false;
    for e in &entries {
        if let Some(pos) = e.find('/') {
            top_levels.insert(e[..pos].to_string());
        } else {
            has_root_files = true;
        }
    }

    let use_groups = !has_root_files && top_levels.len() > 1;

    if !use_groups {
        // Single chapter — everything together
        return vec![("Chapter 1".to_string(), entries)];
    }

    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for e in entries {
        let top = e.split('/').next().unwrap_or("").to_string();
        map.entry(top.clone()).or_default().push(e);
    }
    let mut groups: Vec<(String, Vec<String>)> = map.into_iter().collect();
    // Sort groups by first entry path (natural sort already applied globally)
    groups.sort_by(|a, b| natural_key(&a.0).cmp(&natural_key(&b.0)));

    // Clean chapter titles: strip leading index junk like "01 - "
    let mut out = Vec::new();
    for (raw_title, mut pages) in groups {
        let clean = raw_title
            .trim()
            .trim_start_matches(|c: char| c.is_ascii_digit() || c == '-' || c == '_' || c == ' ' || c == '.')
            .trim()
            .to_string();
        let title = if clean.is_empty() { raw_title } else { clean };
        natural_sort(&mut pages);
        out.push((title, pages));
    }
    out
}

fn derive_chapter_title(fallback_index: usize, entries: &[String]) -> String {
    // Look for c### token in any filename
    for e in entries {
        let lower = e.to_ascii_lowercase();
        if let Some(pos) = lower.find('c') {
            let rest = &lower[pos + 1..];
            let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
            if digits.len() >= 1 && digits.len() <= 4 {
                if let Ok(n) = digits.parse::<u32>() {
                    return format!("Chapter {}", n);
                }
            }
        }
    }
    format!("Part {}", fallback_index + 1)
}

#[tauri::command(rename = "scanArchive")]
pub async fn scan_archive(path: String) -> Result<ArchiveScanResult, String> {
    let res = tokio::task::spawn_blocking(move || -> Result<ArchiveScanResult, String> {
        let zip_path = PathBuf::from(&path);
        if !zip_path.is_file() {
            return Err(format!("archive not found: {path}"));
        }
        let mut entries = collect_image_entries(&zip_path)?;
        if entries.is_empty() {
            return Err("no images found in archive".to_string());
        }
        natural_sort(&mut entries);
        let groups = group_entries(entries);
        let total_pages: usize = groups.iter().map(|(_, v)| v.len()).sum();
        let file_name = zip_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&path)
            .to_string();
        let series_title = zip_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Import")
            .to_string();

        let mut chapters = Vec::new();
        for (idx, (title, pages)) in groups.into_iter().enumerate() {
            let display_title = if title == "Chapter 1" && chapters.is_empty() && pages.len() == total_pages {
                // Single-chapter fallback: try c### detection
                derive_chapter_title(idx, &pages)
            } else {
                title
            };
            chapters.push(ArchiveScanChapter {
                title: display_title,
                page_count: pages.len(),
            });
        }
        // If single group is bare "Chapter 1" with fallback we already handled; if still generic keep it.
        Ok(ArchiveScanResult {
            file_name,
            series_title,
            chapters,
            total_pages,
        })
    })
    .await
    .map_err(|e| format!("scan task failed: {e}"))??;
    Ok(res)
}

#[tauri::command(rename = "importArchive")]
pub async fn import_archive(path: String, meta: LocalSeriesMeta) -> Result<String, String> {
    let res = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let zip_path = PathBuf::from(&path);
        if !zip_path.is_file() {
            return Err(format!("archive not found: {path}"));
        }
        let mut entries = collect_image_entries(&zip_path)?;
        if entries.is_empty() {
            return Err("no images found in archive".to_string());
        }
        natural_sort(&mut entries);
        let mut groups = group_entries(entries);

        // If single chapter group is generic "Chapter 1", derive a nicer title
        if groups.len() == 1 && groups[0].0 == "Chapter 1" {
            let derived = derive_chapter_title(0, &groups[0].1);
            groups[0].0 = derived;
        }

        let series_slug = slugify(&meta.title);
        let series_permalink = format!("local:{}", series_slug);
        let data_root = crate::paths::data_root();
        let series_dir = data_root.join("local").join(&series_slug);
        let chapters_dir = series_dir.join("chapters");

        std::fs::create_dir_all(&chapters_dir).map_err(|e| format!("failed creating series dir: {e}"))?;

        // Open archive once for extraction
        let file = std::fs::File::open(&zip_path).map_err(|e| format!("failed opening archive: {e}"))?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("invalid zip: {e}"))?;

        // Build name -> index map for fast extraction
        let mut name_to_idx: HashMap<String, usize> = HashMap::new();
        for i in 0..archive.len() {
            if let Ok(entry) = archive.by_index(i) {
                name_to_idx.insert(entry.name().to_string(), i);
            }
        }

        let mut chapter_permalinks: Vec<String> = Vec::new();
        let mut total_pages = 0usize;

        for (ch_idx, (ch_title, pages)) in groups.iter().enumerate() {
            let ch_slug = slugify(ch_title);
            // Ensure uniqueness
            let ch_slug = if chapter_permalinks.iter().any(|p| p.ends_with(&format!("-{}", ch_slug)) || p == &format!("local:{}-{}", series_slug, ch_slug)) {
                format!("{}-{}", ch_slug, ch_idx + 1)
            } else {
                ch_slug
            };
            let ch_permalink = format!("local:{}-{}", series_slug, ch_slug);
            let ch_dir = chapters_dir.join(&ch_slug);
            std::fs::create_dir_all(&ch_dir).map_err(|e| format!("failed creating chapter dir: {e}"))?;

            for (page_idx, entry_name) in pages.iter().enumerate() {
                let idx = *name_to_idx.get(entry_name).ok_or_else(|| format!("entry not found: {entry_name}"))?;
                let mut entry = archive.by_index(idx).map_err(|e| format!("zip read error: {e}"))?;
                let ext = entry_name.rsplit('.').next().unwrap_or("jpg").to_ascii_lowercase();
                let out_name = format!("p{:03}.{}", page_idx, ext);
                let out_path = ch_dir.join(&out_name);
                let mut out_file = std::fs::File::create(&out_path).map_err(|e| format!("failed creating page file: {e}"))?;
                std::io::copy(&mut entry, &mut out_file).map_err(|e| format!("failed extracting page: {e}"))?;
            }

            // Write chapter.json
            let chapter_json = serde_json::json!({
                "title": ch_title,
                "permalink": ch_permalink,
                "series_permalink": series_permalink,
                "page_count": pages.len(),
            });
            let ch_json_path = ch_dir.join("chapter.json");
            let chapter_json_str = serde_json::to_string_pretty(&chapter_json)
                .map_err(|e| format!("failed serializing chapter.json: {e}"))?;
            std::fs::write(&ch_json_path, chapter_json_str)
                .map_err(|e| format!("failed writing chapter.json: {e}"))?;

            chapter_permalinks.push(ch_permalink);
            total_pages += pages.len();
        }

        // Write series.json
        let series_json = serde_json::json!({
            "title": meta.title,
            "permalink": series_permalink,
            "author": meta.author,
            "description": meta.description,
            "chapter_count": chapter_permalinks.len(),
            "total_pages": total_pages,
        });
        let series_json_str = serde_json::to_string_pretty(&series_json)
            .map_err(|e| format!("failed serializing series.json: {e}"))?;
        std::fs::write(series_dir.join("series.json"), series_json_str)
            .map_err(|e| format!("failed writing series.json: {e}"))?;

        // Generate cover.webp from first page of first chapter (if available)
        if let Some(first_group) = groups.first() {
            if let Some(first_entry) = first_group.1.first() {
                if let Some(idx) = name_to_idx.get(first_entry) {
                    if let Ok(mut entry) = archive.by_index(*idx) {
                        let mut buf = Vec::new();
                        let _ = entry.read_to_end(&mut buf);
                        if !buf.is_empty() {
                            // Try to create a webp cover; best-effort, ignore errors
                            let cover_path = series_dir.join("cover.webp");
                            let _ = create_cover_webp(&buf, &cover_path);
                        }
                    }
                }
            }
        }

        // Register in SQLite via direct rusqlite (bypass IPC for blocking context)
        // Use the same DB file as the frontend: dynasty_reader.db
        register_local_series_in_db(&series_permalink, &meta, &chapter_permalinks, &groups, &series_slug, total_pages)?;

        Ok(series_permalink)
    })
    .await
    .map_err(|e| format!("import task failed: {e}"))??;
    Ok(res)
}

fn create_cover_webp(src_bytes: &[u8], out_path: &Path) -> Result<(), String> {
    // Try to decode with image crate, then encode as webp at 80 quality
    let img = image::load_from_memory(src_bytes).map_err(|e| format!("cover decode failed: {e}"))?;
    let (w, h) = (img.width(), img.height());
    // Resize to max 600 on largest side for cover
    let max_dim = 600u32;
    let img = if w.max(h) > max_dim {
        let scale = max_dim as f32 / w.max(h) as f32;
        let nw = (w as f32 * scale).round() as u32;
        let nh = (h as f32 * scale).round() as u32;
        img.resize(nw, nh, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };
    let rgb = img.to_rgb8();
    let (w2, h2) = (rgb.width(), rgb.height());
    let encoded = webp::Encoder::from_rgb(rgb.as_raw(), w2, h2).encode(80.0);
    std::fs::write(out_path, &*encoded).map_err(|e| format!("cover write failed: {e}"))?;
    Ok(())
}

fn register_local_series_in_db(
    series_permalink: &str,
    meta: &LocalSeriesMeta,
    chapter_permalinks: &[String],
    groups: &[(String, Vec<String>)],
    series_slug: &str,
    total_pages: usize,
) -> Result<(), String> {
    let db_path = crate::paths::data_root().join("dynasty_reader.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| format!("failed opening db: {e}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("failed enabling WAL: {e}"))?;
    conn.busy_timeout(std::time::Duration::from_millis(5000))
        .map_err(|e| format!("failed busy timeout: {e}"))?;

    // Ensure local_series table exists (idempotent)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS local_series (
            permalink TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT,
            description TEXT,
            cover_path TEXT,
            source_path TEXT,
            chapter_count INTEGER NOT NULL DEFAULT 0,
            total_pages INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("create local_series failed: {e}"))?;

    let now = chrono_like_now();
    let cover_rel_path = format!("local/{}/cover.webp", series_slug);
    let series_cover_abs = crate::paths::data_root().join(&cover_rel_path).to_string_lossy().into_owned();

    conn.execute(
        "INSERT OR REPLACE INTO local_series (permalink, title, author, description, cover_path, source_path, chapter_count, total_pages, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            series_permalink,
            meta.title,
            meta.author,
            meta.description,
            series_cover_abs,
            Option::<String>::None,
            chapter_permalinks.len() as i64,
            total_pages as i64,
            now,
            now
        ],
    )
    .map_err(|e| format!("insert local_series failed: {e}"))?;

    // Ensure cached_metadata and cached_pages tables exist (they do via schema, but be safe)
    // Insert series + chapter metadata + cached_pages rows
    // We do this in a transaction
    let tx = conn.unchecked_transaction().map_err(|e| format!("tx failed: {e}"))?;

    // Series metadata with chapter taggings for SeriesView
    {
        let taggings: Vec<serde_json::Value> = groups
            .iter()
            .enumerate()
            .map(|(idx, (ch_title, _pages))| {
                let ch_permalink = &chapter_permalinks[idx];
                serde_json::json!({
                    "title": ch_title,
                    "permalink": ch_permalink,
                })
            })
            .collect();

        let series_payload = serde_json::json!({
            "name": meta.title,
            "permalink": series_permalink,
            "type": "local",
            "cover": series_cover_abs,
            "description": meta.description,
            "author": meta.author,
            "taggings": taggings,
        })
        .to_string();
        tx.execute(
            "INSERT OR REPLACE INTO cached_metadata (cache_key, data_type, json_payload, cached_at) VALUES (?1, 'series', ?2, ?3)",
            rusqlite::params![format!("series:{}", series_permalink), series_payload, now],
        )
        .map_err(|e| format!("insert series metadata failed: {e}"))?;
    }

    for (idx, (ch_title, pages)) in groups.iter().enumerate() {
        let ch_permalink = &chapter_permalinks[idx];
        let ch_slug = ch_permalink
            .strip_prefix(&format!("local:{}-", series_slug))
            .unwrap_or(ch_permalink);
        // chapter metadata
        let chapter_payload = serde_json::json!({
            "title": ch_title,
            "permalink": ch_permalink,
            "tags": [{"type": "Series", "name": meta.title, "permalink": series_permalink.replace("local:", "")}],
            "pages": (0..pages.len()).map(|pi| {
                let ext = pages[pi].rsplit('.').next().unwrap_or("jpg").to_ascii_lowercase();
                serde_json::json!({
                    "name": format!("p{:03}", pi),
                    "url": format!("/local/{}/chapters/{}/p{:03}.{}", series_slug, ch_slug, pi, ext)
                })
            }).collect::<Vec<_>>(),
        })
        .to_string();
        tx.execute(
            "INSERT OR REPLACE INTO cached_metadata (cache_key, data_type, json_payload, cached_at) VALUES (?1, 'chapter', ?2, ?3)",
            rusqlite::params![format!("chapter:{}", ch_permalink), chapter_payload, now],
        )
        .map_err(|e| format!("insert chapter metadata failed: {e}"))?;

        // cover for chapter: use first page's actual extension
        let first_ext = pages.first().and_then(|n| n.rsplit('.').next()).unwrap_or("jpg");
        let actual_cover = format!("local/{}/chapters/{}/p000.{}", series_slug, ch_slug, first_ext.to_ascii_lowercase());
        let actual_cover_abs = crate::paths::data_root().join(&actual_cover).to_string_lossy().into_owned();
        tx.execute(
            "INSERT OR REPLACE INTO cached_metadata (cache_key, data_type, json_payload, cached_at) VALUES (?1, 'cover', ?2, ?3)",
            rusqlite::params![format!("cover:chapter:{}", ch_permalink), actual_cover_abs, now],
        )
        .map_err(|e| format!("insert cover failed: {e}"))?;

        // cached_pages rows
        for (pi, _) in pages.iter().enumerate() {
            let ext = pages[pi].rsplit('.').next().unwrap_or("jpg").to_ascii_lowercase();
            let file_path = format!("local/{}/chapters/{}/p{:03}.{}", series_slug, ch_slug, pi, ext);
            let page_abs_path = crate::paths::data_root().join(&file_path);
            let file_size = std::fs::metadata(&page_abs_path).map(|m| m.len() as i64).unwrap_or(0);
            let abs = page_abs_path.to_string_lossy().into_owned();
            tx.execute(
                "INSERT OR REPLACE INTO cached_pages (chapter_permalink, page_index, file_path, size_bytes, cached_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![ch_permalink, pi as i64, abs, file_size, now],
            )
            .map_err(|e| format!("insert cached_pages failed: {e}"))?;
            // Also cover for series on first chapter
            if idx == 0 && pi == 0 {
                // Only if cover.webp exists
                if Path::new(&series_cover_abs).exists() {
                    tx.execute(
                        "INSERT OR REPLACE INTO cached_metadata (cache_key, data_type, json_payload, cached_at) VALUES (?1, 'cover', ?2, ?3)",
                        rusqlite::params![format!("cover:series:{}", series_permalink), &series_cover_abs, now],
                    )
                    .map_err(|e| format!("insert series cover failed: {e}"))?;
                } else {
                    // Fallback to first page
                    tx.execute(
                        "INSERT OR REPLACE INTO cached_metadata (cache_key, data_type, json_payload, cached_at) VALUES (?1, 'cover', ?2, ?3)",
                        rusqlite::params![format!("cover:series:{}", series_permalink), abs, now],
                    )
                    .map_err(|e| format!("insert series cover fallback failed: {e}"))?;
                }
            }
        }
    }
    tx.commit().map_err(|e| format!("tx commit failed: {e}"))?;
    Ok(())
}

fn chrono_like_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command(rename = "deleteLocalSeries")]
pub async fn delete_local_series(permalink: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        if !permalink.starts_with("local:") {
            return Err("not a local series permalink".to_string());
        }
        let slug = permalink.trim_start_matches("local:");
        let data_root = crate::paths::data_root();
        let series_dir = data_root.join("local").join(slug);
        if series_dir.exists() {
            std::fs::remove_dir_all(&series_dir).map_err(|e| format!("failed deleting series dir: {e}"))?;
        }
        let db_path = data_root.join("dynasty_reader.db");
        if db_path.exists() {
            let conn = rusqlite::Connection::open(&db_path).map_err(|e| format!("failed opening db: {e}"))?;
            conn.busy_timeout(std::time::Duration::from_millis(5000))
                .map_err(|e| format!("busy timeout failed: {e}"))?;
            // Collect chapter permalinks for this series
            let chapter_permalinks: Vec<String> = conn
                .prepare("SELECT json_payload FROM cached_metadata WHERE cache_key LIKE ?1")
                .and_then(|mut stmt| {
                    let pattern = format!("chapter:local:{}-%", slug);
                    let rows = stmt.query_map([pattern], |row| row.get::<_, String>(0))?;
                    let mut out = Vec::new();
                    for r in rows {
                        if let Ok(payload) = r {
                            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&payload) {
                                if let Some(perm) = v.get("permalink").and_then(|p| p.as_str()) {
                                    out.push(perm.to_string());
                                }
                            }
                        }
                    }
                    Ok(out)
                })
                .unwrap_or_default();

            // Delete rows in transaction
            let tx = conn.unchecked_transaction().map_err(|e| format!("tx failed: {e}"))?;
            tx.execute("DELETE FROM local_series WHERE permalink = ?1", rusqlite::params![permalink])
                .map_err(|e| format!("delete local_series failed: {e}"))?;
            tx.execute(
                "DELETE FROM cached_metadata WHERE cache_key = ?1 OR cache_key LIKE ?2 OR cache_key LIKE ?3",
                rusqlite::params![
                    format!("series:{}", permalink),
                    format!("chapter:local:{}-%", slug),
                    format!("cover:%local:{}%", slug)
                ],
            )
            .map_err(|e| format!("delete cached_metadata failed: {e}"))?;

            for cp in &chapter_permalinks {
                tx.execute("DELETE FROM cached_pages WHERE chapter_permalink = ?1", rusqlite::params![cp])
                    .map_err(|e| format!("delete cached_pages failed: {e}"))?;
                tx.execute("DELETE FROM reading_progress WHERE chapter_permalink = ?1", rusqlite::params![cp])
                    .map_err(|e| format!("delete progress failed: {e}"))?;
                tx.execute("DELETE FROM reading_history WHERE chapter_permalink = ?1", rusqlite::params![cp])
                    .map_err(|e| format!("delete history failed: {e}"))?;
                tx.execute("DELETE FROM bookmarks WHERE chapter_permalink = ?1", rusqlite::params![cp])
                    .map_err(|e| format!("delete bookmark failed: {e}"))?;
            }
            // Also delete any cover metadata for this series
            tx.execute(
                "DELETE FROM cached_metadata WHERE cache_key = ?1 OR cache_key = ?2",
                rusqlite::params![format!("cover:series:{}", permalink), format!("cover:chapter:{}", permalink)],
            )
            .ok();
            tx.commit().map_err(|e| format!("commit failed: {e}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("delete task failed: {e}"))??;
    Ok(())
}
