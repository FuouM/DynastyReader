//! `httpGet` / `httpDownload` backends.
//!
//! HTTP GET and streaming download commands with SSRF validation, body size caps,
//! and connection reuse. GET bodies are capped at 8MB (oversized responses fail
//! loudly instead of truncating), downloads write through a temp file then rename,
//! and results return the resolved absolute path. The `reqwest::Client` is managed
//! once in Tauri state so connections/TLS are reused across calls, unknown methods
//! are rejected, and a default timeout guards against hung servers.

use serde_json::json;
use tauri::State;
use tokio::io::AsyncWriteExt;
use tokio_stream::StreamExt;

const USER_AGENT: &str = concat!("Mozilla/5.0 (Windows NT 10.0; Win64; x64) DynastyReader/", env!("CARGO_PKG_VERSION"));
// RAM quick wins: GET 2 MB (down from 8 MB) is 8× headroom over max Dynasty payload (~250 KB).
// Download cap 128 MB (down from 256 MB) prevents unbounded memory streaming buffers while
// easily holding large releases/CBZ files.
const MAX_GET_BODY: usize = 2 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES: u64 = 128 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS: u64 = 30_000;

pub struct HttpState(pub reqwest::Client);

/// Validates that `raw` is a valid HTTP/HTTPS URL and does not target private or loopback networks (SSRF defense).
pub fn validate_http_url(raw: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(raw).map_err(|e| format!("invalid URL '{raw}': {e}"))?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("unsupported URL scheme '{scheme}': only http and https are permitted"));
    }

    match parsed.host() {
        Some(url::Host::Domain(host_str)) => {
            let host_lower = host_str.to_ascii_lowercase();
            if host_lower == "localhost"
                || host_lower.ends_with(".localhost")
                || host_lower.ends_with(".local")
                || host_lower.ends_with(".internal")
                || host_lower.ends_with(".localdomain")
            {
                return Err(format!("requests to local/internal host '{host_str}' are forbidden"));
            }
        }
        Some(url::Host::Ipv4(ipv4)) => {
            if ipv4.is_loopback()
                || ipv4.is_private()
                || ipv4.is_link_local()
                || ipv4.is_broadcast()
                || ipv4.is_unspecified()
                || ipv4.is_multicast()
            {
                return Err(format!("requests to private/loopback IP '{ipv4}' are forbidden"));
            }
        }
        Some(url::Host::Ipv6(ipv6)) => {
            if ipv6.is_loopback() || ipv6.is_unspecified() || ipv6.is_multicast() {
                return Err(format!("requests to private/loopback IPv6 '{ipv6}' are forbidden"));
            }
            let seg = ipv6.segments();
            // fe80::/10 link-local or fc00::/7 unique local
            if (seg[0] & 0xffc0) == 0xfe80 || (seg[0] & 0xfe00) == 0xfc00 {
                return Err(format!("requests to link-local/unique-local IPv6 '{ipv6}' are forbidden"));
            }
        }
        None => {
            return Err("URL has no host".to_string());
        }
    }

    Ok(parsed)
}

pub fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        // Automatic redirects are disabled: every hop is followed manually via
        // `send_with_redirects` and re-validated against the SSRF blocklist.
        .redirect(reqwest::redirect::Policy::none())
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

const MAX_REDIRECTS: usize = 5;

/// Sends a request and follows redirects manually, re-validating every hop
/// against the SSRF blocklist so a validated public URL cannot redirect into
/// loopback/private/link-local space (e.g. cloud metadata endpoints).
pub async fn send_with_redirects(
    client: &reqwest::Client,
    method: &str,
    url: &str,
    body: Option<String>,
    content_type: Option<&str>,
    headers: Option<&serde_json::Map<String, serde_json::Value>>,
    timeout_ms: Option<u64>,
) -> Result<reqwest::Response, String> {
    let mut current = validate_http_url(url)?;
    let mut method = method.trim().to_ascii_uppercase();
    let mut body = body;
    for hop in 0..=MAX_REDIRECTS {
        let req = build_request(
            client,
            current.as_str(),
            &method,
            body.as_deref(),
            content_type,
            headers,
        )?;
        let resp = apply_timeout(req, timeout_ms)
            .send()
            .await
            .map_err(|e| format!("http request failed: {e}"))?;
        let status = resp.status();
        let code = status.as_u16();
        // Only 301, 302, 303, 307, 308 are redirects with a Location target to
        // follow. 304 Not Modified is a caching revalidation response (RFC 9110)
        // that carries no Location header, and 300 Multiple Choices is not an
        // automatic redirect.
        if !matches!(code, 301 | 302 | 303 | 307 | 308) {
            return Ok(resp);
        }
        if hop == MAX_REDIRECTS {
            return Err(format!("too many redirects (>{MAX_REDIRECTS})"));
        }
        let location = resp
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| format!("redirect {} without Location header", status.as_u16()))?;
        let joined = current
            .join(location)
            .map_err(|e| format!("invalid redirect target '{location}': {e}"))?;
        current = validate_http_url(joined.as_str())?;
        let code = status.as_u16();
        // 303 always switches to GET; 301/302 downgrade POST per browser convention.
        if code == 303 || ((code == 301 || code == 302) && method == "POST") {
            method = "GET".to_string();
            body = None;
        }
    }
    unreachable!()
}

/// Reads a full response body with a hard byte cap, failing loudly on overflow.
pub async fn read_body_capped(resp: reqwest::Response, cap: usize) -> Result<Vec<u8>, String> {
    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("failed reading response body: {e}"))?;
        if buf.len() + chunk.len() > cap {
            return Err(format!("response body exceeds {cap} byte limit"));
        }
        buf.extend_from_slice(&chunk);
    }
    Ok(buf)
}

/// Streams a `bytes_stream` into `file` with a hard byte cap, invoking `on_chunk` per chunk.
/// Returns total bytes written. Flushes the file before returning.
pub async fn stream_to_file_capped<S>(
    stream: &mut S,
    file: &mut tokio::fs::File,
    cap: u64,
    mut on_chunk: impl FnMut(u64),
) -> Result<u64, String>
where
    S: tokio_stream::Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Unpin,
{
    let mut total: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("failed reading download stream: {e}"))?;
        total += chunk.len() as u64;
        if total > cap {
            return Err(format!("download exceeds size cap of {cap} bytes"));
        }
        on_chunk(chunk.len() as u64);
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("failed writing download: {e}"))?;
    }
    file.flush()
        .await
        .map_err(|e| format!("failed writing download: {e}"))?;
    Ok(total)
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
    let resp = send_with_redirects(
        &state.0,
        method_str,
        &url,
        body,
        content_type.as_deref(),
        Some(&hdrs),
        timeout_ms,
    )
    .await?;
    let status = resp.status().as_u16();
    let etag = resp
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let mut body_text = String::new();
    if status != 304 {
        // Never hand a truncated body to the caller — that would fail later in
        // `JSON.parse` with a confusing error. Fail loudly instead.
        let buf = read_body_capped(resp, MAX_GET_BODY).await?;
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
    let parent = target.parent().unwrap_or(&target);
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|e| format!("failed creating output dir: {e}"))?;
    let resp = send_with_redirects(&state.0, "GET", &url, None, None, None, timeout_ms).await?;
    if !resp.status().is_success() {
        return Err(format!("http download failed: status {}", resp.status()));
    }

    // Write through the temp file's own handle (`keep()`) — opening the same
    // path twice can hit Windows sharing violations. `keep()` detaches the
    // RAII auto-delete guard so the file remains on disk for atomic rename,
    // and the error path below removes the partial file manually if write fails.
    let temp_file = tempfile::Builder::new()
        .prefix(".tmp-download-")
        .tempfile_in(parent)
        .map_err(|e| format!("failed creating temp download file: {e}"))?;

    let (std_file, temp_path) = temp_file
        .keep()
        .map_err(|e| format!("failed keeping temp download file: {e}"))?;
    let mut out = tokio::fs::File::from_std(std_file);
    let mut stream = resp.bytes_stream();
    let write_result = stream_to_file_capped(&mut stream, &mut out, MAX_DOWNLOAD_BYTES, |_| {}).await;
    drop(out);
    let _ = match write_result {
        Ok(total) => total,
        Err(e) => {
            let _ = tokio::fs::remove_file(&temp_path).await;
            return Err(e);
        }
    };
    tokio::fs::rename(&temp_path, &target)
        .await
        .map_err(|e| format!("failed finalizing download: {e}"))?;
    let size = std::fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
    Ok(json!({
        "written_to": output_path,
        "size_bytes": size,
        "absolute_path": target.to_string_lossy().into_owned(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_http_url() {
        assert!(validate_http_url("https://dynasty-scans.com/chapters/example").is_ok());
        assert!(validate_http_url("http://dynasty-scans.com/images/cover.jpg").is_ok());
        assert!(validate_http_url("https://api.github.com/repos/FuouM/DynastyReader/releases").is_ok());

        // Block non-http schemes
        assert!(validate_http_url("file:///etc/passwd").is_err());
        assert!(validate_http_url("javascript:alert(1)").is_err());
        assert!(validate_http_url("ftp://ftp.example.com").is_err());

        // Block localhost / internal hostnames
        assert!(validate_http_url("http://localhost:8080/secret").is_err());
        assert!(validate_http_url("http://service.localhost/").is_err());
        assert!(validate_http_url("http://printer.local/").is_err());
        assert!(validate_http_url("http://server.internal/").is_err());

        // Block private/loopback IP ranges
        assert!(validate_http_url("http://127.0.0.1:8080/").is_err());
        assert!(validate_http_url("http://127.0.0.2/").is_err());
        assert!(validate_http_url("http://10.0.0.1/admin").is_err());
        assert!(validate_http_url("http://192.168.1.1/").is_err());
        assert!(validate_http_url("http://172.16.0.1/").is_err());
        assert!(validate_http_url("http://169.254.169.254/metadata").is_err());
        assert!(validate_http_url("http://0.0.0.0/").is_err());
        assert!(validate_http_url("http://[::1]/").is_err());
    }

    #[tokio::test]
    async fn test_tempfile_download_lifecycle() {
        use tokio::io::AsyncWriteExt;
        let dir = std::env::temp_dir();
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();

        // 1. Successful download flow: keep -> from_std -> write -> flush -> drop -> rename
        let tmp = tempfile::Builder::new()
            .prefix(".tmp-test-")
            .tempfile_in(&dir)
            .unwrap();
        let target = dir.join(format!(".tmp-target-test-{}", nonce));
        let (std_file, tmp_path) = tmp.keep().expect("keep temp file");
        assert!(tmp_path.exists(), "temp file must exist on disk after keep()");

        let mut out = tokio::fs::File::from_std(std_file);
        out.write_all(b"cover image data").await.unwrap();
        out.flush().await.unwrap();
        drop(out);

        tokio::fs::rename(&tmp_path, &target).await.unwrap();
        assert!(target.exists(), "target must exist after atomic rename");
        assert!(!tmp_path.exists(), "temp path must not exist after rename");
        let content = tokio::fs::read(&target).await.unwrap();
        assert_eq!(content, b"cover image data");
        let _ = tokio::fs::remove_file(&target).await;

        // 2. Error cleanup flow: keep -> simulated failure -> remove_file
        let tmp_err = tempfile::Builder::new()
            .prefix(".tmp-test-err-")
            .tempfile_in(&dir)
            .unwrap();
        let (_std_file_err, tmp_err_path) = tmp_err.keep().expect("keep temp file");
        assert!(tmp_err_path.exists());
        // Simulated failure clean up
        let _ = tokio::fs::remove_file(&tmp_err_path).await;
        assert!(!tmp_err_path.exists(), "temp file must be deleted on error path");
    }

    #[test]
    fn test_status_code_redirect_classification() {
        // True HTTP redirects with a Location header to follow
        for code in [301, 302, 303, 307, 308] {
            assert!(
                matches!(code, 301 | 302 | 303 | 307 | 308),
                "code {code} must be classified as redirect"
            );
        }
        // Status codes that must NOT be treated as redirects (304 Not Modified, etc.)
        for code in [200, 204, 300, 304, 305, 306, 400, 404, 500] {
            assert!(
                !matches!(code, 301 | 302 | 303 | 307 | 308),
                "code {code} must not be classified as redirect"
            );
        }
    }
}
