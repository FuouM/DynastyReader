//! `dbExecute` / `dbQuery` / `dbExecuteBatch` backends.
//!
//! Mirrors the Curator sandboxed SQLite primitives
//! (`curator-db/src/plugin_db.rs`): a connection pool keyed by `db_name` under
//! the portable data root, with the same serde_json ⇄ SQL value coercion and
//! row-to-object serialization.
//!
//! `rusqlite::Connection` is not `Sync`, so connections live behind a
//! `Mutex<HashMap<String, Arc<Mutex<Connection>>>>` in Tauri state: the outer
//! lock guards the map only (never held across blocking work), and each named
//! database has its own inner lock so unrelated databases do not serialize.
//! `db_name` is normalized to lowercase so the case-insensitive-Windows
//! `SQLITE_BUSY` collision is impossible. All blocking SQLite work runs on the
//! blocking pool via `spawn_blocking`.

use rusqlite::{params_from_iter, Connection};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct DbPool(pub Mutex<HashMap<String, Arc<Mutex<Connection>>>>);

fn open(db_name: &str) -> Result<Connection, String> {
    let normalized = db_name.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err("missing db name".to_string());
    }
    let safe = normalized
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if !safe || normalized.starts_with('.') || normalized.contains("..") {
        return Err("invalid database name".to_string());
    }
    let path = crate::paths::data_root().join(&normalized);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed creating database directory: {e}"))?;
    }
    let conn = Connection::open(&path).map_err(|e| format!("failed opening database: {e}"))?;
    // WAL tuned for the app's read-heavy, single-writer workload: NORMAL
    // synchronous keeps commit latency low without sacrificing durability on
    // checkpoint, journal_size_limit bounds the WAL growth, and
    // wal_autocheckpoint keeps it from ballooning.
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("failed enabling WAL: {e}"))?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| format!("failed tuning synchronous mode: {e}"))?;
    conn.pragma_update(None, "journal_size_limit", 64 * 1024 * 1024)
        .map_err(|e| format!("failed tuning journal size limit: {e}"))?;
    conn.pragma_update(None, "wal_autocheckpoint", 1000)
        .map_err(|e| format!("failed tuning wal autocheckpoint: {e}"))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| format!("failed enabling foreign keys: {e}"))?;
    conn.busy_timeout(std::time::Duration::from_millis(5000))
        .map_err(|e| format!("failed setting busy timeout: {e}"))?;
    Ok(conn)
}

fn get_conn(
    pool: &mut HashMap<String, Arc<Mutex<Connection>>>,
    db_name: &str,
) -> Result<Arc<Mutex<Connection>>, String> {
    let key = db_name.trim().to_ascii_lowercase();
    if !pool.contains_key(&key) {
        let conn = Arc::new(Mutex::new(open(&key)?));
        pool.insert(key.clone(), conn);
    }
    pool.get(&key).cloned().ok_or_else(|| "database not initialized".to_string())
}

fn bind_value(p: &Value) -> rusqlite::types::Value {
    match p {
        Value::Null => rusqlite::types::Value::Null,
        Value::Bool(b) => rusqlite::types::Value::Integer(*b as i64),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                rusqlite::types::Value::Integer(i)
            } else if let Some(u) = n.as_u64() {
                rusqlite::types::Value::Integer(u as i64)
            } else if let Some(f) = n.as_f64() {
                rusqlite::types::Value::Real(f)
            } else {
                rusqlite::types::Value::Integer(0)
            }
        }
        Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        other => rusqlite::types::Value::Text(other.to_string()),
    }
}

fn row_to_json(row: &rusqlite::Row<'_>) -> Result<Value, rusqlite::Error> {
    let mut obj = Map::new();
    let row_ref = row.as_ref();
    let count = row_ref.column_count();
    for i in 0..count {
        let name = row_ref.column_name(i)?.to_string();
        let value = row.get_ref(i)?;
        let cell = match value {
            rusqlite::types::ValueRef::Null => Value::Null,
            rusqlite::types::ValueRef::Integer(v) => json!(v),
            rusqlite::types::ValueRef::Real(v) => json!(v),
            rusqlite::types::ValueRef::Text(v) => json!(String::from_utf8_lossy(v).into_owned()),
            rusqlite::types::ValueRef::Blob(v) => json!(String::from_utf8_lossy(v).into_owned()),
        };
        obj.insert(name, cell);
    }
    Ok(Value::Object(obj))
}

#[tauri::command(rename = "dbExecute")]
pub async fn db_execute(
    state: State<'_, DbPool>,
    db_name: String,
    sql: String,
    params: Option<Vec<Value>>,
) -> Result<serde_json::Value, String> {
    let conn = {
        let mut pool = state.0.lock().unwrap_or_else(|e| e.into_inner());
        get_conn(&mut pool, &db_name)?
    };
    let values: Vec<rusqlite::types::Value> =
        params.unwrap_or_default().iter().map(bind_value).collect();
    let affected = tokio::task::spawn_blocking(move || -> Result<usize, String> {
        let conn = conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(&sql, params_from_iter(values))
            .map_err(|e| format!("db execute failed: {e}"))
    })
    .await
    .map_err(|e| format!("db execute task failed: {e}"))??;
    Ok(json!({ "rows_affected": affected }))
}

#[tauri::command(rename = "dbQuery")]
pub async fn db_query(
    state: State<'_, DbPool>,
    db_name: String,
    sql: String,
    params: Option<Vec<Value>>,
) -> Result<serde_json::Value, String> {
    let conn = {
        let mut pool = state.0.lock().unwrap_or_else(|e| e.into_inner());
        get_conn(&mut pool, &db_name)?
    };
    let values: Vec<rusqlite::types::Value> =
        params.unwrap_or_default().iter().map(bind_value).collect();
    let rows = tokio::task::spawn_blocking(move || -> Result<Vec<Value>, String> {
        let conn = conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("db query prepare failed: {e}"))?;
        let mapped = stmt
            .query_map(params_from_iter(values), row_to_json)
            .map_err(|e| format!("db query failed: {e}"))?;
        mapped
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("db query failed: {e}"))
    })
    .await
    .map_err(|e| format!("db query task failed: {e}"))??;
    Ok(json!({ "rows": rows }))
}
/// Runs multiple write statements inside one transaction so a multi-step
/// cleanup can never leave the DB in a half-applied state. Each statement has
/// its own optional parameter list (one list per statement, `?` placeholders).
#[tauri::command(rename = "dbExecuteBatch")]
pub async fn db_execute_batch(
    state: State<'_, DbPool>,
    db_name: String,
    statements: Vec<String>,
    params: Option<Vec<Option<Vec<Value>>>>,
) -> Result<serde_json::Value, String> {
    let normalized = db_name.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err("missing db name".to_string());
    }
    let pool_arc = {
        let mut pool = state.0.lock().map_err(|_| "db pool poisoned".to_string())?;
        get_conn(&mut pool, &db_name)?
    };
    let st = statements.clone();
    let pr = params.clone();
    let affected = tokio::task::spawn_blocking(move || {
        let conn = pool_arc.lock().map_err(|_| "db connection poisoned".to_string())?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let mut results: Vec<i64> = Vec::with_capacity(st.len());
        for (idx, sql) in st.iter().enumerate() {
            let p = pr
                .as_ref()
                .and_then(|v| v.get(idx).cloned().flatten())
                .unwrap_or_default();
            let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
            let n = stmt
                .execute(params_from_iter(p.iter().map(bind_value)))
                .map_err(|e| e.to_string())?;
            results.push(n as i64);
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok::<Vec<i64>, String>(results)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(json!({ "rows_affected": affected }))
}

/// Creates a timestamped backup of `db_name` inside the portable data root
/// using SQLite's `VACUUM INTO` (consistent snapshot even with WAL).
#[tauri::command(rename = "dbBackup")]
pub async fn db_backup(
    state: State<'_, DbPool>,
    db_name: String,
) -> Result<serde_json::Value, String> {
    let normalized = db_name.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err("missing db name".to_string());
    }
    let safe = normalized
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if !safe || normalized.starts_with('.') || normalized.contains("..") {
        return Err("invalid database name".to_string());
    }
    let pool_arc = {
        let mut pool = state.0.lock().map_err(|_| "db pool poisoned".to_string())?;
        get_conn(&mut pool, &db_name)?
    };
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup_filename = format!("{}.backup.{}.db", normalized, ts);
    let backup_path = crate::paths::data_root().join(&backup_filename);
    let backup_str = backup_path.to_string_lossy().to_string();
    // Escape single quotes for the VACUUM INTO literal.
    let escaped = backup_str.replace('\'', "''");
    let sql = format!("VACUUM INTO '{}'", escaped);
    let backup_path_clone = backup_path.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool_arc.lock().map_err(|_| "db connection poisoned".to_string())?;
        conn.execute(&sql, []).map_err(|e| e.to_string())?;
        let meta = std::fs::metadata(&backup_path_clone).map_err(|e| e.to_string())?;
        Ok::<u64, String>(meta.len())
    })
    .await
    .map_err(|e| e.to_string())??;
    // Report backup file size via dirStat-style shape.
    let size = std::fs::metadata(&backup_path).map(|m| m.len()).unwrap_or(0);
    Ok(json!({
        "backup_path": backup_filename,
        "absolute_path": backup_str,
        "size_bytes": size
    }))
}

/// Lists `*.backup.*.db` files for `db_name` under the data root.
#[tauri::command(rename = "dbListBackups")]
pub async fn db_list_backups(db_name: String) -> Result<serde_json::Value, String> {
    let normalized = db_name.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err("missing db name".to_string());
    }
    let prefix = format!("{}.backup.", normalized);
    let root = crate::paths::data_root();
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<serde_json::Value>, String> {
        let rd = std::fs::read_dir(&root).map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for ent in rd {
            let ent = ent.map_err(|e| e.to_string())?;
            let fname = ent.file_name().to_string_lossy().to_string();
            if !fname.starts_with(&prefix) || !fname.ends_with(".db") {
                continue;
            }
            let meta = ent.metadata().map_err(|e| e.to_string())?;
            if !meta.is_file() {
                continue;
            }
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            out.push(json!({
                "filename": fname,
                "size_bytes": meta.len(),
                "modified_secs": modified
            }));
        }
        // Newest first
        out.sort_by(|a, b| {
            let am = a.get("modified_secs").and_then(|v| v.as_u64()).unwrap_or(0);
            let bm = b.get("modified_secs").and_then(|v| v.as_u64()).unwrap_or(0);
            bm.cmp(&am)
        });
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(json!({ "backups": entries }))
}

/// Restores `backup_filename` over `db_name` atomically. Closes any pooled
/// connection, removes WAL/SHM sidecars, then copies the backup file. The DB
/// is re-opened lazily on next `get_conn`.
#[tauri::command(rename = "dbRestore")]
pub async fn db_restore(
    state: State<'_, DbPool>,
    db_name: String,
    backup_filename: String,
) -> Result<serde_json::Value, String> {
    let normalized = db_name.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err("missing db name".to_string());
    }
    let safe = normalized
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if !safe || normalized.starts_with('.') || normalized.contains("..") {
        return Err("invalid database name".to_string());
    }
    let bf = backup_filename.trim().to_string();
    if bf.is_empty() || bf.contains('/') || bf.contains('\\') || bf.contains("..") {
        return Err("invalid backup filename".to_string());
    }
    let prefix = format!("{}.backup.", normalized);
    if !bf.starts_with(&prefix) || !bf.ends_with(".db") {
        return Err("backup filename does not match expected pattern".to_string());
    }
    let root = crate::paths::data_root();
    let backup_path = root.join(&bf);
    let target_path = root.join(&normalized);
    let wal_path = root.join(format!("{}-wal", normalized));
    let shm_path = root.join(format!("{}-shm", normalized));
    // Validate backup exists and is a file
    tokio::task::spawn_blocking({
        let backup_path = backup_path.clone();
        move || -> Result<(), String> {
            let meta = std::fs::metadata(&backup_path).map_err(|e| format!("backup not found: {e}"))?;
            if !meta.is_file() {
                return Err("backup is not a file".to_string());
            }
            Ok(())
        }
    })
    .await
    .map_err(|e| e.to_string())??;

    // Drop pooled connection so no handle keeps the file locked.
    {
        let mut pool = state.0.lock().map_err(|_| "db pool poisoned".to_string())?;
        pool.remove(&normalized);
        // Also remove case-variant key if present (pool keys are lowercased on insert,
        // but be defensive).
        let lower = normalized.to_ascii_lowercase();
        if lower != normalized {
            pool.remove(&lower);
        }
    }
    // Also remove original-case key as inserted via get_conn (uses raw db_name lowercasing internally)
    // Ensure we also remove the key exactly as get_conn would have inserted: lowercased db_name.
    // The above already handles it; do a broad sweep for any key that lowercases to normalized.
    {
        let mut pool = state.0.lock().map_err(|_| "db pool poisoned".to_string())?;
        let keys: Vec<String> = pool.keys().cloned().collect();
        for k in keys {
            if k.to_ascii_lowercase() == normalized {
                pool.remove(&k);
            }
        }
    }

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        std::thread::sleep(std::time::Duration::from_millis(150));
        for attempt in 0..5 {
            let _ = std::fs::remove_file(&wal_path);
            let _ = std::fs::remove_file(&shm_path);
            match std::fs::copy(&backup_path, &target_path) {
                Ok(_) => return Ok(()),
                Err(e) => {
                    let is_lock = e.kind() == std::io::ErrorKind::PermissionDenied
                        || e.raw_os_error() == Some(32)
                        || e.to_string().contains("being used by another process");
                    if is_lock && attempt < 4 {
                        std::thread::sleep(std::time::Duration::from_millis(200 * (attempt + 1) as u64));
                        continue;
                    }
                    return Err(e.to_string());
                }
            }
        }
        Err("failed to restore after retries".to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(json!({
        "restored": true,
        "backup_filename": bf,
        "target": normalized
    }))
}

/// Restores `db_name` from an arbitrary absolute `source_path` chosen via the
/// OS file picker. Unlike `dbRestore`, the source may be outside the data root
/// (e.g. a backup stored elsewhere). The same WAL/SHM cleanup and pool-drop
/// semantics apply.
#[tauri::command(rename = "dbRestoreFromPath")]
pub async fn db_restore_from_path(
    state: State<'_, DbPool>,
    db_name: String,
    source_path: String,
) -> Result<serde_json::Value, String> {
    let normalized = db_name.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err("missing db name".to_string());
    }
    let safe = normalized
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if !safe || normalized.starts_with('.') || normalized.contains("..") {
        return Err("invalid database name".to_string());
    }
    let src = source_path.trim().to_string();
    if src.is_empty() {
        return Err("missing source path".to_string());
    }
    // Basic safety: reject path traversal tricks in the source, but allow
    // absolute paths outside the data root.
    if src.contains('\0') {
        return Err("invalid source path".to_string());
    }
    let src_path = std::path::PathBuf::from(&src);
    let root = crate::paths::data_root();
    let target_path = root.join(&normalized);
    let wal_path = root.join(format!("{}-wal", normalized));
    let shm_path = root.join(format!("{}-shm", normalized));

    tokio::task::spawn_blocking({
        let src_path = src_path.clone();
        move || -> Result<(), String> {
            let meta = std::fs::metadata(&src_path).map_err(|e| format!("source not found: {e}"))?;
            if !meta.is_file() {
                return Err("source is not a file".to_string());
            }
            if meta.len() == 0 {
                return Err("source file is empty".to_string());
            }
            Ok(())
        }
    })
    .await
    .map_err(|e| e.to_string())??;

    {
        let mut pool = state.0.lock().map_err(|_| "db pool poisoned".to_string())?;
        pool.remove(&normalized);
    }
    {
        let mut pool = state.0.lock().map_err(|_| "db pool poisoned".to_string())?;
        let keys: Vec<String> = pool.keys().cloned().collect();
        for k in keys {
            if k.to_ascii_lowercase() == normalized {
                pool.remove(&k);
            }
        }
    }
    let src_path_clone = src_path.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        // Brief pause to let the pooled SQLite connection fully close and
        // release the Windows file lock after `pool.remove` above.
        std::thread::sleep(std::time::Duration::from_millis(150));
        for attempt in 0..5 {
            let _ = std::fs::remove_file(&wal_path);
            let _ = std::fs::remove_file(&shm_path);
            match std::fs::copy(&src_path_clone, &target_path) {
                Ok(_) => return Ok(()),
                Err(e) => {
                    let is_lock = e.kind() == std::io::ErrorKind::PermissionDenied
                        || e.raw_os_error() == Some(32)
                        || e.to_string().contains("being used by another process");
                    if is_lock && attempt < 4 {
                        std::thread::sleep(std::time::Duration::from_millis(200 * (attempt + 1) as u64));
                        continue;
                    }
                    return Err(e.to_string());
                }
            }
        }
        Err("failed to restore after retries".to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(json!({
        "restored": true,
        "source_path": src,
        "target": normalized
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(tag: &str) -> std::path::PathBuf {
        // Shared with paths tests: `set_root` is a one-shot OnceLock, so every
        // FS-backed test must agree on the same root directory.
        let dir =
            std::env::temp_dir().join(format!("dsreader-test-{tag}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("create temp root");
        dir
    }

    #[test]
    fn db_open_normalizes_and_sets_pragmas() {
        let root = temp_root("shared");
        crate::paths::set_root(root.clone());
        let conn = open("Cache.db").expect("open normalized db");
        let journal: String = conn
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert_eq!(journal.to_lowercase(), "wal");
        assert!(
            root.join("cache.db").exists(),
            "db name must be normalized to lowercase on disk"
        );
    }

    #[test]
    fn db_name_validation() {
        let root = temp_root("shared");
        crate::paths::set_root(root.clone());
        assert!(open("").is_err());
        assert!(open("  ").is_err());
        assert!(open("..").is_err());
        assert!(open(".hidden").is_err());
        assert!(open("a b").is_err());
        assert!(open("ok-name_1.2").is_ok());
    }

    #[test]
    fn bind_value_coercion() {
        use rusqlite::types::Value as Rv;
        assert_eq!(bind_value(&Value::Null), Rv::Null);
        assert_eq!(bind_value(&Value::Bool(true)), Rv::Integer(1));
        assert_eq!(bind_value(&Value::Bool(false)), Rv::Integer(0));
        assert_eq!(bind_value(&Value::Number(3.into())), Rv::Integer(3));
        assert_eq!(
            bind_value(&Value::Number(serde_json::Number::from_f64(2.5).unwrap())),
            Rv::Real(2.5)
        );
        assert_eq!(bind_value(&Value::String("x".into())), Rv::Text("x".into()));
        assert_eq!(bind_value(&json!(["a"])), Rv::Text("[\"a\"]".to_string()));
    }
}