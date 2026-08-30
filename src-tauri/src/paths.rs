//! Portable data root and sandboxed path resolution for the standalone reader.
//!
//! Sandboxed path security boundary: every path a command touches must resolve
//! strictly inside the portable `.data` root. Two input forms are accepted:
//!   * plugin-relative — `pages/series/ch/page_0001.jpg`, `covers/x.webp`, `""`
//!   * absolute — the app re-probes absolute paths it previously received from
//!     `HttpDownloadResult.absolute_path` / `ConvertImagesResult.output_path`
//!     and stored in `cached_metadata.json_payload` / `cached_pages.file_path`.
//!
//! Anything that escapes the root (absolute input outside it, `..`, NTFS
//! tricks) is rejected.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Injected once at startup (desktop: the portable root; mobile: Tauri's
/// `app_data_dir`). Commands resolve against this for the app's lifetime.
static ROOT: OnceLock<PathBuf> = OnceLock::new();

/// Portable data root: `DSREADER_DATA_DIR` env override → injected `ROOT` →
/// `<exe dir>/.data` → `./.data` (CWD fallback).
pub fn data_root() -> PathBuf {
    if let Ok(dir) = std::env::var("DSREADER_DATA_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    if let Some(root) = ROOT.get() {
        return root.clone();
    }
    // Dev via `cargo run` / `tauri dev`: CARGO_MANIFEST_DIR is src-tauri.
    // Prefer the repo's `.data` (parent of src-tauri) so dev and portable
    // builds share the same cache when launched from the repo.
    if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
        if let Some(repo_root) = Path::new(&manifest).parent() {
            let repo_data = repo_root.join(".data");
            if repo_data.is_dir() || repo_root.join("src-tauri").join("Cargo.toml").exists() {
                if let Ok(canon) = repo_data.canonicalize() {
                    return canon;
                }
                return repo_data;
            }
        }
    }
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| {
            log::warn!("current_exe unavailable; falling back to CWD for data root");
            PathBuf::from(".")
        })
        .join(".data")
}

/// Inject the resolved data root. Only the first call takes effect; call it in
/// `main.rs` setup before any command runs. Mobile uses `app.path().app_data_dir()`.
pub fn set_root(root: PathBuf) {
    let _ = ROOT.set(root);
}

/// Create the data root if missing. Returns the root.
pub fn ensure_root() -> Result<PathBuf, String> {
    let root = data_root();
    std::fs::create_dir_all(&root).map_err(|e| format!("failed to create data directory: {e}"))?;
    Ok(root)
}

/// Reject NTFS tricks and trailing dot/space in every component of an absolute
/// path. Containment is enforced separately by the canonical-root check.
fn reject_unsafe_components(path: &str) -> Result<(), String> {
    for comp in Path::new(path).components() {
        if let std::path::Component::Normal(name) = comp {
            let s = name.to_string_lossy();
            if s.contains(':') || s.ends_with('.') || s.ends_with(' ') {
                return Err("illegal path component (NTFS trick or trailing dot/space)".to_string());
            }
        }
    }
    Ok(())
}

/// Canonicalize the deepest existing ancestor of `target`, then re-append the
/// non-existing tail. Defends against symlinked roots and intermediate
/// directories without requiring the final file to exist yet.
///
/// Returns an error when even the deepest ancestor cannot be canonicalized
/// (e.g. a broken symlink or an unreadable path component); containment must
/// never silently degrade to a lexical comparison.
pub fn canonicalize_ancestor(target: &Path) -> Result<PathBuf, String> {
    let mut existing = target.to_path_buf();
    let mut tail: Vec<OsString> = Vec::new();
    loop {
        if existing.as_os_str().is_empty() || existing.exists() {
            break;
        }
        match existing.parent() {
            Some(parent) if parent != existing => {
                if let Some(name) = existing.file_name() {
                    tail.push(name.to_os_string());
                }
                existing = parent.to_path_buf();
            }
            _ => break,
        }
    }
    let canonical = existing
        .canonicalize()
        .map_err(|e| format!("failed to canonicalize {existing:?}: {e}"))?;
    let mut out = canonical;
    for comp in tail.into_iter().rev() {
        out.push(comp);
    }
    Ok(out)
}

/// Resolve a raw path into an absolute path confined to the portable data root.
///
/// NOTE — TOCTOU: the containment check canonicalizes `target` and then the
/// command operates on the original (non-canonical) path. A local adversary who
/// can swap a path component for a symlink between the check and the use could
/// race this, exactly as with Curator's `SandboxedPath`. The boundary is
/// intended to confine first-party inputs (plugin paths, stored absolute paths),
/// not to withstand a hostile local process.
pub fn resolve_in_root(raw: &str) -> Result<PathBuf, String> {
    let root = data_root();
    if raw.is_empty() {
        return Ok(root);
    }
    let p = Path::new(raw);
    let target = if p.is_absolute() {
        reject_unsafe_components(raw)?;
        p.to_path_buf()
    } else {
        if p.has_root() {
            return Err("path escapes data directory".to_string());
        }
        reject_unsafe_components(raw)?;
        for comp in p.components() {
            if matches!(comp, std::path::Component::ParentDir) {
                return Err("path escapes data directory".to_string());
            }
        }
        root.join(p)
    };

    let canonical_root = canonicalize_ancestor(&root)?;
    let canonical_target = canonicalize_ancestor(&target)?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err("path escapes data directory".to_string());
    }
    Ok(target)
}

/// Returns true if `target` resolves to the data root directory itself.
pub fn is_root_dir(target: &Path) -> Result<bool, String> {
    let root = data_root();
    let canonical_root = canonicalize_ancestor(&root)?;
    let canonical_target = canonicalize_ancestor(target)?;
    Ok(canonical_target == canonical_root)
}

#[cfg(test)]
pub(crate) fn temp_root(tag: &str) -> PathBuf {
    // Shared across root-dependent tests: `set_root` is a one-shot OnceLock,
    // so every FS-backed test must agree on the same root directory.
    let dir = std::env::temp_dir().join(format!("dsreader-test-{tag}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("create temp root");
    dir
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sandbox_containment() {
        let root = temp_root("shared");
        set_root(root.clone());

        assert_eq!(resolve_in_root("").unwrap(), root);
        assert_eq!(resolve_in_root("pages/a.jpg").unwrap(), root.join("pages/a.jpg"));

        for bad in ["../escape", "a/../../b", "/etc/passwd"] {
            assert!(resolve_in_root(bad).is_err(), "{bad} must be rejected");
        }

        for bad in ["covers/x.webp.", "covers/x.webp ", "covers/a:b.webp"] {
            assert!(resolve_in_root(bad).is_err(), "{bad} must be rejected (NTFS trick)");
        }
        assert!(resolve_in_root("covers/x.webp").is_ok());

        let abs = root.join("pages/s.jpg");
        assert_eq!(resolve_in_root(&abs.to_string_lossy()).unwrap(), abs);

        let outside = std::env::temp_dir().join("dsreader-outside.txt");
        assert!(resolve_in_root(&outside.to_string_lossy()).is_err());
    }

    #[test]
    fn reject_unsafe_components_directly() {
        assert!(reject_unsafe_components("covers/x.webp").is_ok());
        assert!(reject_unsafe_components("covers/x.webp.").is_err());
        assert!(reject_unsafe_components("covers/x.webp ").is_err());
        assert!(reject_unsafe_components("covers/a:b.webp").is_err());
    }

    #[test]
    fn test_is_root_dir() {
        let root = temp_root("shared");
        set_root(root.clone());

        assert!(is_root_dir(&root).unwrap());
        assert!(is_root_dir(&resolve_in_root("").unwrap()).unwrap());
        assert!(!is_root_dir(&resolve_in_root("pages/ch1").unwrap()).unwrap());
    }
}
