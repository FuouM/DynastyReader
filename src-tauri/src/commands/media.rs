//! `EphemeralConvertImages` backend (WebP thumbnail transcoding and format conversion).
//!
//! Bounded dimension + byte-budget image transcoding pipeline:
//!   * WebP is encoded lossy at the requested quality (covers are display thumbnails).
//!   * The byte budget uses estimate-then-verify: encoded size scales ~linearly
//!     with pixel count, so `scale = sqrt(max_bytes / bytes)` lands near the
//!     target in one re-encode (cheap Triangle filter).
//!   * The source is header-inspected (`into_dimensions`) before full decode
//!     so decompression bombs cannot allocate (rejected if exceeding `MAX_SOURCE_DIMENSION`).
//!   * Conversions in a batch run concurrently up to `MAX_CONCURRENT_CONVERT_TASKS`
//!     while preserving input order.

use image::{
    DynamicImage, ExtendedColorType, GenericImageView, ImageEncoder, ImageReader,
    codecs::{
        bmp::BmpEncoder, gif::GifEncoder, jpeg::JpegEncoder, png::PngEncoder,
    },
    imageops::FilterType,
};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

const ENCODE_FORMATS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "bmp"];

/// Hard ceiling on a source image dimension, applied to the header before any
/// decode. Legit covers/pages are well under this; decompression bombs are not.
// RAM quick wins: 8192 (down from 16384) bounds decompression bomb allocations to 256 MB.
// 1 concurrent convert task (down from 2) cuts peak uncompressed pixel memory in half (~12 MB vs 24 MB).
// 8 KB initial encode buffer (down from 32 KB) cuts initial buffer allocation per encode.
const MAX_SOURCE_DIMENSION: u32 = 8_192;

/// Headroom on the estimate-then-verify scale — the next encode is inexact.
const BUDGET_ESTIMATE_HEADROOM: f64 = 0.95;
const DEFAULT_CONVERT_QUALITY: u8 = 80;
const MAX_CONCURRENT_CONVERT_TASKS: usize = 1;
const MAX_SHRINK_LOOP_ITERATIONS: usize = 32;
const MIN_SHRINK_DIMENSION_PX: u32 = 8;
const INITIAL_ENCODE_BUFFER_BYTES: usize = 8 * 1024;
#[tauri::command(rename = "ephemeralConvertImages")]
pub async fn ephemeral_convert_images(
    conversions: Vec<(String, String)>,
    quality: Option<u8>,
    max_dimension: Option<u32>,
    max_bytes: Option<u64>,
) -> Result<serde_json::Value, String> {
    let quality = quality.unwrap_or(DEFAULT_CONVERT_QUALITY).clamp(1, 100);
    let count = conversions.len();
    // Bound image decode/encode concurrency to cap peak uncompressed RAM.
    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_CONVERT_TASKS));
    let mut set = JoinSet::new();
    for (i, (src, dst)) in conversions.into_iter().enumerate() {
        let sem = semaphore.clone();
        set.spawn(async move {
            let _permit = sem.acquire_owned().await;
            (
                i,
                convert_one(&src, &dst, quality, max_dimension, max_bytes).await,
            )
        });
    }
    let mut ordered: Vec<Option<serde_json::Value>> = vec![None; count];
    while let Some(joined) = set.join_next().await {
        match joined {
            Ok((i, value)) => {
                if let Some(slot) = ordered.get_mut(i) {
                    *slot = Some(value);
                }
            }
            Err(e) => log::error!("convert task failed: {e}"),
        }
    }
    let converted = ordered.into_iter().flatten().collect::<Vec<_>>();
    Ok(json!({ "converted": converted }))
}

async fn convert_one(
    source: &str,
    target: &str,
    quality: u8,
    max_dimension: Option<u32>,
    max_bytes: Option<u64>,
) -> serde_json::Value {
    let failure = |error: String| {
        json!({ "source_path": source, "output_path": "", "error": error })
    };

    let src_path = match crate::paths::resolve_in_root(source) {
        Ok(p) => p,
        Err(e) => return failure(e),
    };
    let tgt_path = match crate::paths::resolve_in_root(target) {
        Ok(p) => p,
        Err(e) => return failure(e),
    };

    if !src_path.is_file() {
        return failure(format!("Source file not found: {source}"));
    }
    let ext = match tgt_path.extension().and_then(|s| s.to_str()) {
        Some(e) => e.to_lowercase(),
        None => return failure("Target path has no file extension".to_string()),
    };
    if !ENCODE_FORMATS.contains(&ext.as_str()) {
        return failure(format!(
            "Unsupported target format: '{ext}'. Supported: {}",
            ENCODE_FORMATS.join(", ")
        ));
    }
    if let Some(parent) = tgt_path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return failure(format!("Failed to create output directory: {e}"));
        }
    }

    let src_buf = src_path.to_string_lossy().into_owned();
    let tgt_buf = tgt_path.to_string_lossy().into_owned();
    let output_display = tgt_buf.clone();

    let res = tokio::task::spawn_blocking(move || {
        encode_image(
            &src_buf,
            &tgt_buf,
            &ext,
            quality,
            max_dimension,
            max_bytes,
        )
    })
    .await;

    match res {
        Ok(Ok(())) => json!({ "source_path": source, "output_path": output_display, "error": "" }),
        Ok(Err(e)) => failure(e),
        Err(e) => failure(format!("Task join panicked: {e}")),
    }
}

fn encode_image(
    source: &str,
    output: &str,
    ext: &str,
    quality: u8,
    max_dimension: Option<u32>,
    max_bytes: Option<u64>,
) -> Result<(), String> {
    // Header inspection before full decode: reject decompression bombs.
    let (w, h) = ImageReader::open(source)
        .map_err(|e| format!("Failed to open source: {e}"))?
        .into_dimensions()
        .map_err(|e| format!("Failed to read source dimensions: {e}"))?;
    if w > MAX_SOURCE_DIMENSION || h > MAX_SOURCE_DIMENSION {
        return Err(format!(
            "Source exceeds max dimension {MAX_SOURCE_DIMENSION} (got {w}x{h})"
        ));
    }

    let mut img = image::open(source).map_err(|e| format!("Failed to open/decode source: {e}"))?;
    // Bound the larger side, preserving aspect ratio. Single Lanczos3 resize
    // from the original — no cascading resamples.
    if let Some(md) = max_dimension {
        if md > 0 {
            let (w, h) = img.dimensions();
            let largest = w.max(h);
            if largest > md {
                let scale = md as f64 / largest as f64;
                let nw = ((w as f64 * scale).round() as u32).max(1);
                let nh = ((h as f64 * scale).round() as u32).max(1);
                img = img.resize(nw, nh, FilterType::Lanczos3);
            }
        }
    }

    let mut bytes = encode_dynamic(&img, ext, quality)?;

    // Enforce the output size budget. Estimate-then-verify: resize straight to
    // the predicted scale, then a bounded halving loop as the stubborn-case
    // fallback. Cheap Triangle filter — cover thumbs display at 42x58, where
    // any filter difference is invisible.
    if let Some(mb) = max_bytes {
        if mb > 0 && bytes.len() as u64 > mb {
            let scale =
                ((mb as f64 / bytes.len() as f64).sqrt() * BUDGET_ESTIMATE_HEADROOM).min(1.0);
            let (w, h) = img.dimensions();
            let nw = ((w as f64 * scale).round() as u32).clamp(1, w);
            let nh = ((h as f64 * scale).round() as u32).clamp(1, h);
            img = img.resize(nw, nh, FilterType::Triangle);
            bytes = encode_dynamic(&img, ext, quality)?;

            let mut guard = 0;
            while bytes.len() as u64 > mb && guard < MAX_SHRINK_LOOP_ITERATIONS {
                let (w, h) = img.dimensions();
                if w < MIN_SHRINK_DIMENSION_PX || h < MIN_SHRINK_DIMENSION_PX {
                    break;
                }
                img = img.resize(w / 2, h / 2, FilterType::Triangle);
                bytes = encode_dynamic(&img, ext, quality)?;
                guard += 1;
            }
        }
    }

    std::fs::write(output, &bytes).map_err(|e| format!("Failed to write output file: {e}"))
}

enum BufferRef<'a> {
    Borrowed(&'a [u8]),
    Owned(Vec<u8>),
}

impl<'a> std::ops::Deref for BufferRef<'a> {
    type Target = [u8];
    fn deref(&self) -> &[u8] {
        match self {
            BufferRef::Borrowed(b) => b,
            BufferRef::Owned(v) => v.as_slice(),
        }
    }
}

fn as_rgba8_bytes(img: &DynamicImage) -> BufferRef<'_> {
    match img.as_rgba8() {
        Some(b) => BufferRef::Borrowed(b.as_raw()),
        None => BufferRef::Owned(img.to_rgba8().into_raw()),
    }
}

fn as_rgb8_bytes(img: &DynamicImage) -> BufferRef<'_> {
    match img.as_rgb8() {
        Some(b) => BufferRef::Borrowed(b.as_raw()),
        None => BufferRef::Owned(img.to_rgb8().into_raw()),
    }
}

fn encode_dynamic(img: &DynamicImage, ext: &str, quality: u8) -> Result<Vec<u8>, String> {
    let (w, h) = img.dimensions();
    let mut buf = Vec::with_capacity(INITIAL_ENCODE_BUFFER_BYTES);
    match ext {
        "png" => PngEncoder::new(&mut buf)
            .write_image(&as_rgba8_bytes(img), w, h, ExtendedColorType::Rgba8)
            .map_err(|e| format!("PNG encode failed: {e}"))?,
        "jpg" | "jpeg" => JpegEncoder::new_with_quality(&mut buf, quality)
            .write_image(&as_rgb8_bytes(img), w, h, ExtendedColorType::Rgb8)
            .map_err(|e| format!("JPEG encode failed: {e}"))?,
        "webp" => {
            let data = as_rgb8_bytes(img);
            let encoded = webp::Encoder::from_rgb(&data, w, h).encode(quality as f32);
            buf.extend_from_slice(encoded.as_ref());
        }
        "gif" => GifEncoder::new(&mut buf)
            .write_image(&as_rgba8_bytes(img), w, h, ExtendedColorType::Rgba8)
            .map_err(|e| format!("GIF encode failed: {e}"))?,
        "bmp" => BmpEncoder::new(&mut buf)
            .write_image(&as_rgba8_bytes(img), w, h, ExtendedColorType::Rgba8)
            .map_err(|e| format!("BMP encode failed: {e}"))?,
        _ => unreachable!("ext was pre-validated against ENCODE_FORMATS"),
    }
    Ok(buf)
}