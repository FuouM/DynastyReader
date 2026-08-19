//! `httpGet` / `httpDownload` backends.
//!
//! Mirrors the Curator handlers (`curator-service/src/handlers/plugin_commands/network.rs`):
//! GET bodies are capped at 8MB (oversized responses fail loudly instead of
//! truncating), downloads write through a temp file then rename, and results
//! return the resolved absolute path (the plugin stores it and later re-probes
//! it). The `reqwest::Client` is managed once in Tauri state so
//! connections/TLS are reused across calls, unknown methods are rejected, and a
//! default timeout guards against hung servers.

use serde_json::json;
use tauri::State;
use tokio::io::AsyncWriteExt;
use tokio_stream::StreamExt;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Curator/1.0";
const MAX_GET_BODY: usize = 8 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES: u64 = 256 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS: u64 = 30_000;

pub struct HttpState(pub reqwest::Client);

pub fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))
}

fn build_request(
    client: &reqwest::Client,
    url: &str,
    method: &str,
    body: Option<&str>,
    content_type: Option<&str>,
    headers: Option<&serde_json::Map<String, serde_json::Value>>,
) -> Result<reqwest::RequestBuilder, String> {
    let method = method.trim().to_ascii_uppercase();
    let mut req = match method.as_str() {
        "GET" => client.get(url),
        "POST" => client.post(url),
        other => {
            return Err(format!("unsupported http method: '{other}' (only GET/POST allowed)"));
        }
    };
    if let Some(ct) = content_type {
        req = req.header(reqwest::header::CONTENT_TYPE, ct);
    }
    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            if let Some(v) = v.as_str() {
                req = req.header(k, v);
            }
        }
    }
    if let Some(b) = body {
        req = req.body(b.to_string());
    }
    Ok(req)
}

fn apply_timeout(req: reqwest::RequestBuilder, timeout_ms: Option<u64>) -> reqwest::RequestBuilder {
    req.timeout(std::time::Duration::from_millis(timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS)))
}

#[tauri::command(rename = "httpGet")]
pub async fn http_get(
    state: State<'_, HttpState>,
    url: String,
    method: Option<String>,
    body: Option<String>,
    content_type: Option<String>,
    headers: Option<serde_json::Value>,
    timeout_ms: Option<u64>,
) -> Result<serde_json::Value, String> {
    let method_str = method.as_deref().unwrap_or("GET");
    let hdrs = headers
        .and_then(|h| h.as_object().cloned())
        .unwrap_or_default();
    let req = build_request(
        &state.0,
        &url,
        method_str,
        body.as_deref(),
        content_type.as_deref(),
        Some(&hdrs),
    )?;
    let resp = apply_timeout(req, timeout_ms)
        .send()
        .await
        .map_err(|e| format!("http get failed: {e}"))?;
    let status = resp.status().as_u16();
    let etag = resp
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let mut body_text = String::new();
    if status != 304 {
        let mut stream = resp.bytes_stream();
        let mut buf: Vec<u8> = Vec::new();
        let mut truncated = false;
        while buf.len() < MAX_GET_BODY {
            match stream.next().await {
                Some(Ok(chunk)) => {
                    let remaining = MAX_GET_BODY - buf.len();
                    buf.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
                    if chunk.len() > remaining {
                        truncated = true;
                        break;
                    }
                }
                Some(Err(e)) => {
                    return Err(format!("failed reading response body: {e}"));
                }
                None => break,
            }
        }
        // Never hand a truncated body to the caller — that would fail later in
        // `JSON.parse` with a confusing error. Fail loudly instead.
        if truncated {
            return Err(format!(
                "http get failed: response body exceeds {MAX_GET_BODY} byte limit"
            ));
        }
        body_text = String::from_utf8_lossy(&buf).into_owned();
    }
    Ok(json!({ "status": status, "body": body_text, "etag": etag }))
}

#[tauri::command(rename = "httpDownload")]
pub async fn http_download(
    state: State<'_, HttpState>,
    url: String,
    output_path: String,
    timeout_ms: Option<u64>,
) -> Result<serde_json::Value, String> {
    let target = crate::paths::resolve_in_root(&output_path)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("failed creating output dir: {e}"))?;
    }
    let client = &state.0;
    let req = apply_timeout(client.get(&url), timeout_ms);
    let resp = req
        .send()
        .await
        .map_err(|e| format!("http download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("http download failed: status {}", resp.status()));
    }

    // Write through a temp file, then rename (mirrors the Curator handler).
    // Any mid-stream failure removes the temp file before returning.
    let tmp = target.with_extension("tmp");
    let write_result: Result<u64, String> = async {
        let mut out = tokio::fs::File::create(&tmp)
            .await
            .map_err(|e| format!("failed writing download: {e}"))?;
        let mut stream = resp.bytes_stream();
        let mut total: u64 = 0;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("failed reading download stream: {e}"))?;
            total += chunk.len() as u64;
            if total > MAX_DOWNLOAD_BYTES {
                return Err(format!(
                    "download exceeds size cap of {} bytes",
                    MAX_DOWNLOAD_BYTES
                ));
            }
            out.write_all(&chunk)
                .await
                .map_err(|e| format!("failed writing download: {e}"))?;
        }
        out.flush()
            .await
            .map_err(|e| format!("failed writing download: {e}"))?;
        Ok(total)
    }
    .await;
    if let Err(e) = write_result {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    if let Err(e) = std::fs::rename(&tmp, &target) {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("failed finalizing download: {e}"));
    }
    let size = std::fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
    Ok(json!({
        "written_to": output_path,
        "size_bytes": size,
        "absolute_path": target.to_string_lossy().into_owned(),
    }))
}
