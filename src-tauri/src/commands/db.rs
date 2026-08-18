//! `PluginDbQuery` / `PluginDbExecute` backends.
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
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("failed enabling WAL: {e}"))?;
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

#[tauri::command]
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

#[tauri::command]
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