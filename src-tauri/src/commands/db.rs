//! `dbExecute` / `dbQuery` / `dbExecuteBatch` backends.
//!
//! Sandboxed SQLite connection pool keyed by `db_name` under the portable data
//! root, with serde_json ⇄ SQL value coercion and row-to-object serialization.
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
use crate::util::lock_unpoisoned;

pub struct DbPool(pub Mutex<HashMap<String, Arc<Mutex<Connection>>>>);

// RAM quick win: 256 pages × 1 KB = 256 KB memory cache per connection (down from 2 MB default),
// saving ~1.7 MB per DB connection. Queries remain fast and transparently backed by WAL.
const SQLITE_JOURNAL_SIZE_LIMIT: i64 = 2 * 1024 * 1024;
const SQLITE_CACHE_SIZE_PAGES: i64 = -256;
const SQLITE_WAL_AUTOCHECKPOINT_PAGES: i64 = 500;
const SQLITE_BUSY_TIMEOUT_MS: u64 = 5000;
const BACKUP_PAGE_STEP: i32 = 100;
const BACKUP_STEP_SLEEP_MS: u64 = 250;
const RESTORE_RETRY_INITIAL_DELAY_MS: u64 = 150;
const RESTORE_RETRY_BACKOFF_MS: u64 = 200;
const RESTORE_MAX_ATTEMPTS: usize = 5;

fn validate_db_name(db_name: &str) -> Result<String, String> {
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
    Ok(normalized)
}
pub const ALLOWED_PRAGMAS: &[&str] = &[
    "user_version",
    "table_info",
    "journal_mode",
    "synchronous",
    "foreign_keys",
    "busy_timeout",
    "wal_checkpoint",
    "page_count",
    "page_size",
    "freelist_count",
    "index_list",
    "index_info",
];

/// SQLite native authorizer callback for `dbQuery`.
/// Strictly enforces read-only access: only SELECT, column reads, scalar functions,
/// and allowlisted inspection PRAGMAs are permitted.
pub fn authorize_query(ctx: rusqlite::hooks::AuthContext<'_>) -> rusqlite::hooks::Authorization {
    use rusqlite::hooks::{AuthAction, Authorization};
    match ctx.action {
        AuthAction::Select | AuthAction::Read { .. } | AuthAction::Function { .. } | AuthAction::Recursive => {
            Authorization::Allow
        }
        AuthAction::Pragma { pragma_name, .. } => {
            let name = pragma_name.to_ascii_lowercase();
            if ALLOWED_PRAGMAS.contains(&name.as_str()) {
                Authorization::Allow
            } else {
                Authorization::Deny
            }
        }
        _ => Authorization::Deny,
    }
}

/// SQLite native authorizer callback for `dbExecute` and `dbExecuteBatch`.
/// Permits application DML/DDL (INSERT, UPDATE, DELETE, CREATE, ALTER, VACUUM)
/// but strictly denies ATTACH/DETACH (arbitrary file access), DROP TABLE (accidental/malicious wipe),
/// and unauthorized PRAGMAs (e.g. writable_schema, load_extension).
pub fn authorize_execute(ctx: rusqlite::hooks::AuthContext<'_>) -> rusqlite::hooks::Authorization {
    use rusqlite::hooks::{AuthAction, Authorization};
    match ctx.action {
        AuthAction::Attach { filename } => {
            // VACUUM internally issues Attach with an empty filename to create its temp database.
            // External ATTACH statements always specify a non-empty filename.
            if filename.is_empty() {
                Authorization::Allow
            } else {
                Authorization::Deny
            }
        }
        AuthAction::Detach { database_name } => {
            // VACUUM internally issues Detach on "vacuum_db".
            if database_name == "vacuum_db" {
                Authorization::Allow
            } else {
                Authorization::Deny
            }
        }
        AuthAction::DropTable { .. }
        | AuthAction::DropView { .. }
        | AuthAction::DropTrigger { .. }
        | AuthAction::DropVtable { .. }
        | AuthAction::CreateVtable { .. } => Authorization::Deny,
        AuthAction::Pragma { pragma_name, .. } => {
            let name = pragma_name.to_ascii_lowercase();
            if ALLOWED_PRAGMAS.contains(&name.as_str()) {
                Authorization::Allow
            } else {
                Authorization::Deny
            }
        }

        _ => Authorization::Allow,
    }
}
fn open(db_name: &str) -> Result<Connection, String> {
    let normalized = validate_db_name(db_name)?;
    let path = crate::paths::data_root().join(&normalized);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed creating database directory: {e}"))?;
    }
    let conn = Connection::open(&path).map_err(|e| format!("failed opening database: {e}"))?;
    configure_connection(&conn)?;
    Ok(conn)
}

/// Applies the app-wide connection tuning. Every connection touching the app
/// database MUST go through this so background workers cannot regress to
/// rollback-journal defaults (SQLITE_BUSY against the pool) or silently drop
/// `ON DELETE CASCADE` behavior (foreign_keys off by default).
fn configure_connection(conn: &Connection) -> Result<(), String> {
    // WAL tuned for the app's read-heavy, single-writer workload: NORMAL
    // synchronous keeps commit latency low without sacrificing durability on
    // checkpoint, journal_size_limit bounds the WAL growth, and
    // wal_autocheckpoint keeps it from ballooning.
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("failed enabling WAL: {e}"))?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| format!("failed tuning synchronous mode: {e}"))?;
    conn.pragma_update(None, "journal_size_limit", SQLITE_JOURNAL_SIZE_LIMIT)
        .map_err(|e| format!("failed tuning journal size limit: {e}"))?;
    conn.pragma_update(None, "cache_size", SQLITE_CACHE_SIZE_PAGES)
        .map_err(|e| format!("failed tuning cache size: {e}"))?;
    conn.pragma_update(None, "wal_autocheckpoint", SQLITE_WAL_AUTOCHECKPOINT_PAGES)
        .map_err(|e| format!("failed tuning wal autocheckpoint: {e}"))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| format!("failed enabling foreign keys: {e}"))?;
    conn.busy_timeout(std::time::Duration::from_millis(SQLITE_BUSY_TIMEOUT_MS))
        .map_err(|e| format!("failed setting busy timeout: {e}"))?;
    Ok(())
}

/// Opens a one-off connection to an absolute database path with the same
/// tuning as pooled connections. Background workers (download queue, local
/// import) MUST use this instead of naked `Connection::open`.
pub fn open_synced(path: &std::path::Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("failed opening database: {e}"))?;
    configure_connection(&conn)?;
    Ok(conn)
}

fn get_conn(
    pool: &Mutex<HashMap<String, Arc<Mutex<Connection>>>>,
    db_name: &str,
) -> Result<Arc<Mutex<Connection>>, String> {
    let key = validate_db_name(db_name)?;
    {
        let guard = lock_unpoisoned(pool);
        if let Some(conn) = guard.get(&key) {
            return Ok(conn.clone());
        }
    }
    let conn = Arc::new(Mutex::new(open(&key)?));
    let mut guard = lock_unpoisoned(pool);
    let entry = guard.entry(key).or_insert(conn);
    Ok(entry.clone())
}

fn bind_value_owned(v: Value) -> Result<rusqlite::types::Value, String> {
    match v {
        Value::Null => Ok(rusqlite::types::Value::Null),
        Value::Bool(b) => Ok(rusqlite::types::Value::Integer(b as i64)),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(rusqlite::types::Value::Integer(i))
            } else if let Some(u) = n.as_u64() {
                // u64 > i64::MAX would silently wrap negative — refuse instead.
                i64::try_from(u)
                    .map(rusqlite::types::Value::Integer)
                    .map_err(|_| format!("integer parameter {u} exceeds i64 range"))
            } else if let Some(f) = n.as_f64() {
                Ok(rusqlite::types::Value::Real(f))
            } else {
                Err("number parameter cannot be represented as i64 or f64".to_string())
            }
        }
        Value::String(s) => Ok(rusqlite::types::Value::Text(s)),
        other => Ok(rusqlite::types::Value::Text(other.to_string())),
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
    let conn = get_conn(&state.0, &db_name)?;
    let values: Vec<rusqlite::types::Value> = params
        .unwrap_or_default()
        .into_iter()
        .map(bind_value_owned)
        .collect::<Result<Vec<_>, _>>()?;
    let affected = tokio::task::spawn_blocking(move || -> Result<usize, String> {
        let conn = lock_unpoisoned(&conn);
        conn.authorizer(Some(authorize_execute));
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
    let conn = get_conn(&state.0, &db_name)?;
    let values: Vec<rusqlite::types::Value> = params
        .unwrap_or_default()
        .into_iter()
        .map(bind_value_owned)
        .collect::<Result<Vec<_>, _>>()?;
    let rows = tokio::task::spawn_blocking(move || -> Result<Vec<Value>, String> {
        let conn = lock_unpoisoned(&conn);
        conn.authorizer(Some(authorize_query));
        let mut stmt = conn
            .prepare_cached(&sql)
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
    let pool_arc = get_conn(&state.0, &db_name)?;
    let affected = tokio::task::spawn_blocking(move || {
        let conn = lock_unpoisoned(&pool_arc);
        conn.authorizer(Some(authorize_execute));
        let tx = conn.unchecked_transaction().map_err(|e| format!("failed starting transaction: {e}"))?;
        let mut results: Vec<i64> = Vec::with_capacity(statements.len());
        for (idx, sql) in statements.iter().enumerate() {
            let p = params
                .as_ref()
                .and_then(|v| v.get(idx).cloned().flatten())
                .unwrap_or_default();
            let mut stmt = conn.prepare_cached(sql).map_err(|e| format!("failed preparing statement: {e}"))?;
            let bound = p
                .into_iter()
                .map(bind_value_owned)
                .collect::<Result<Vec<_>, _>>()?;
            let n = stmt
                .execute(params_from_iter(bound))
                .map_err(|e| format!("failed executing statement: {e}"))?;
            results.push(n as i64);
        }
        tx.commit().map_err(|e| format!("failed committing batch: {e}"))?;
        Ok::<Vec<i64>, String>(results)
    })
    .await
    .map_err(|e| format!("batch task failed: {e}"))??;
    Ok(json!({ "rows_affected": affected }))
}

/// Creates a timestamped (millisecond-resolution) backup of `db_name` inside
/// the portable data root via SQLite's online backup API.
#[tauri::command(rename = "dbBackup")]
pub async fn db_backup(
    _state: State<'_, DbPool>,
    db_name: String,
) -> Result<serde_json::Value, String> {
    let normalized = validate_db_name(&db_name)?;
    let src_db_path = crate::paths::data_root().join(&normalized);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let backup_filename = format!("{}.backup.{}.db", normalized, ts);
    let backup_path = crate::paths::data_root().join(&backup_filename);
    let backup_str = backup_path.to_string_lossy().to_string();
    let size = tokio::task::spawn_blocking(move || {
        // Back up from a dedicated source connection (WAL permits a concurrent
        // reader) so the pooled connection is never blocked for the duration.
        let src_conn = open_synced(&src_db_path)?;
        let mut dst_conn = Connection::open(&backup_path)
            .map_err(|e| format!("failed creating backup target: {e}"))?;
        configure_connection(&dst_conn).map_err(|e| format!("failed configuring backup connection: {e}"))?;
        let backup = rusqlite::backup::Backup::new(&src_conn, &mut dst_conn)
            .map_err(|e| format!("failed initializing backup: {e}"))?;
        backup
            .run_to_completion(BACKUP_PAGE_STEP, std::time::Duration::from_millis(BACKUP_STEP_SLEEP_MS), None)
            .map_err(|e| format!("backup execution failed: {e}"))?;
        drop(backup);
        drop(dst_conn);
        let meta = std::fs::metadata(&backup_path).map_err(|e| format!("failed stating backup file: {e}"))?;
        Ok::<u64, String>(meta.len())
    })
    .await
    .map_err(|e| format!("backup task failed: {e}"))??;
    Ok(json!({
        "backup_path": backup_filename,
        "absolute_path": backup_str,
        "size_bytes": size
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
    let normalized = validate_db_name(&db_name)?;
    let src = source_path.trim().to_string();
    if src.is_empty() || src.contains('\0') {
        return Err("missing or invalid source path".to_string());
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
            // Reject non-SQLite files: restoring a random file (PDF, image)
            // would silently brick the database.
            let mut head = [0u8; 16];
            {
                use std::io::Read;
                let mut f = std::fs::File::open(&src_path)
                    .map_err(|e| format!("source unreadable: {e}"))?;
                let n = f
                    .read(&mut head)
                    .map_err(|e| format!("source unreadable: {e}"))?;
                if n < 16 || &head != b"SQLite format 3\0" {
                    return Err("source is not a SQLite database".to_string());
                }
            }
            Ok(())
        }
    })
    .await
    .map_err(|e| format!("restore validation failed: {e}"))??;

    evict_pool_connection(&state.0, &normalized)?;
    copy_db_file_with_retry(src_path, target_path, wal_path, shm_path).await?;

    Ok(json!({
        "restored": true,
        "source_path": src,
        "target": normalized
    }))
}

fn evict_pool_connection(
    pool: &Mutex<HashMap<String, Arc<Mutex<Connection>>>>,
    normalized: &str,
) -> Result<(), String> {
    let mut guard = lock_unpoisoned(pool);
    guard.retain(|k, _| k != &normalized);
    Ok(())
}

async fn copy_db_file_with_retry(
    source: std::path::PathBuf,
    target: std::path::PathBuf,
    wal: std::path::PathBuf,
    shm: std::path::PathBuf,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        std::thread::sleep(std::time::Duration::from_millis(RESTORE_RETRY_INITIAL_DELAY_MS));
        for attempt in 0..RESTORE_MAX_ATTEMPTS {
            if let Err(e) = std::fs::remove_file(&wal) {
                log::warn!("failed removing WAL sidecar: {e}");
            }
            if let Err(e) = std::fs::remove_file(&shm) {
                log::warn!("failed removing SHM sidecar: {e}");
            }
            match std::fs::copy(&source, &target) {
                Ok(_) => return Ok(()),
                Err(e) => {
                    let is_lock = e.kind() == std::io::ErrorKind::PermissionDenied
                        || e.raw_os_error() == Some(32)
                        || e.to_string().contains("being used by another process");
                    if is_lock && attempt < RESTORE_MAX_ATTEMPTS - 1 {
                        std::thread::sleep(std::time::Duration::from_millis(RESTORE_RETRY_BACKOFF_MS * (attempt + 1) as u64));
                        continue;
                    }
                    return Err(format!("failed to restore after {RESTORE_MAX_ATTEMPTS} attempts: {e}"));
                }
            }
        }
        Err(format!("failed to restore after {RESTORE_MAX_ATTEMPTS} attempts"))
    })
    .await
    .map_err(|e| format!("restore task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::paths::temp_root;

    #[test]
    fn test_authorizer_rules() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT)", []).unwrap();

        // 1. Query authorizer allows SELECT and functions
        conn.authorizer(Some(authorize_query));
        assert!(conn.query_row("SELECT 1", [], |r| r.get::<_, i64>(0)).is_ok());
        assert!(conn.query_row("SELECT 'foo;bar'", [], |r| r.get::<_, String>(0)).is_ok());
        assert!(conn.query_row("WITH x AS (SELECT 1 AS a) SELECT * FROM x", [], |r| r.get::<_, i64>(0)).is_ok());
        assert!(conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0)).is_ok());
        assert!(conn.query_row("PRAGMA table_info(test)", [], |_| Ok(())).is_ok());

        // Query authorizer denies INSERT, UPDATE, DELETE, DROP, ATTACH
        assert!(conn.execute("INSERT INTO test (val) VALUES ('x')", []).is_err());
        assert!(conn.execute("DELETE FROM test", []).is_err());
        assert!(conn.execute("DROP TABLE test", []).is_err());
        assert!(conn.execute("ATTACH DATABASE 'evil.db' AS evil", []).is_err());
        assert!(conn.execute("PRAGMA writable_schema = 1", []).is_err());

        // 2. Execute authorizer allows INSERT, UPDATE, DELETE, CREATE, ALTER, VACUUM
        conn.authorizer(Some(authorize_execute));
        assert!(conn.execute("INSERT INTO test (val) VALUES ('x')", []).is_ok());
        assert!(conn.execute("UPDATE test SET val = 'y' WHERE id = 1", []).is_ok());
        assert!(conn.execute("DELETE FROM test WHERE id = 1", []).is_ok());
        assert!(conn.execute("CREATE TABLE test2 (id INTEGER)", []).is_ok());
        assert!(conn.execute("VACUUM", []).is_ok());

        // Execute authorizer denies DROP TABLE, ATTACH, DETACH, unsafe PRAGMAs
        assert!(conn.execute("DROP TABLE test2", []).is_err());
        assert!(conn.execute("ATTACH DATABASE 'evil.db' AS evil", []).is_err());
        assert!(conn.execute("DETACH DATABASE evil", []).is_err());
        assert!(conn.execute("PRAGMA writable_schema = 1", []).is_err());
        assert!(conn.execute("PRAGMA load_extension('evil.dll')", []).is_err());

        // 3. execute_batch is also checked by the authorizer
        assert!(conn.execute_batch("SELECT 1; ATTACH 'evil.db' AS evil;").is_err());
        assert!(conn.execute_batch("SELECT 1; DROP TABLE test2;").is_err());
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
        assert_eq!(bind_value_owned(Value::Null).unwrap(), Rv::Null);
        assert_eq!(bind_value_owned(Value::Bool(true)).unwrap(), Rv::Integer(1));
        assert_eq!(bind_value_owned(Value::Bool(false)).unwrap(), Rv::Integer(0));
        assert_eq!(bind_value_owned(Value::Number(3.into())).unwrap(), Rv::Integer(3));
        assert_eq!(
            bind_value_owned(Value::Number(serde_json::Number::from_f64(2.5).unwrap())).unwrap(),
            Rv::Real(2.5)
        );
        assert_eq!(bind_value_owned(Value::String("x".into())).unwrap(), Rv::Text("x".into()));
        assert_eq!(bind_value_owned(json!(["a"])).unwrap(), Rv::Text("[\"a\"]".to_string()));
        // Out-of-range integers and unrepresentable numbers are hard errors,
        // not silent wraps to 0 / negative.
        assert!(bind_value_owned(json!(u64::MAX)).is_err());
    }

}