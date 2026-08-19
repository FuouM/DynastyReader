//! `EphemeralConvertImages` backend (WebP thumbnail transcoding and friends).
//!
//! Mirrors the Curator engine (`curator-media/src/convert.rs`): bounded
//! dimension + byte-budget loop. Deliberate divergences (see §8.3 of the sweep
//! report):
//!   * WebP is encoded **lossy at the requested quality** — covers are display
//!     thumbnails where lossless fidelity is wasted; lossy q75 lands far under
//!     the size budget on the first encode, so the shrink loop rarely runs.
//!   * The byte budget uses estimate-then-verify: encoded size scales ~linearly
//!     with pixel count, so `scale = sqrt(max_bytes / bytes)` lands near the
//!     target in one re-encode (cheap Triangle filter) instead of blind
//!     halving. The halving loop remains as a bounded stubborn-case fallback.
//!   * The source is header-inspected (`into_dimensions`) before a full decode
//!     so decompression bombs cannot allocate; sources are rejected if any
//!     dimension exceeds `MAX_SOURCE_DIMENSION`.
//!   * The resolved absolute source path is decoded (a plugin-relative string
//!     would resolve against process CWD), and conversions in a batch run
//!     concurrently while preserving input order.

use image::{
    DynamicImage, ExtendedColorType, GenericImageView, ImageEncoder, ImageReader,
    codecs::{
        bmp::BmpEncoder, gif::GifEncoder, hdr::HdrEncoder, ico::IcoEncoder, jpeg::JpegEncoder,
        png::PngEncoder, pnm::PnmEncoder, qoi::QoiEncoder, tga::TgaEncoder, tiff::TiffEncoder,
    },
    imageops::FilterType,
};
use serde_json::json;
use std::io::Cursor;
use tokio::task::JoinSet;

const ENCODE_FORMATS: &[&str] = &[
    "png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "qoi", "tga", "pnm", "hdr", "ico",
];

/// Hard ceiling on a source image dimension, applied to the header before any
/// decode. Legit covers/pages are well under this; decompression bombs are not.
const MAX_SOURCE_DIMENSION: u32 = 16_384;

/// Headroom on the estimate-then-verify scale — the next encode is inexact.
const BUDGET_ESTIMATE_HEADROOM: f64 = 0.95;

#[tauri::command(rename = "ephemeralConvertImages")]
pub async fn ephemeral_convert_images(
    conversions: Vec<(String, String)>,
    quality: Option<u8>,
    max_dimension: Option<u32>,
    max_bytes: Option<u64>,
) -> Result<serde_json::Value, String> {
    let quality = quality.unwrap_or(80).clamp(1, 100);
    let count = conversions.len();
    let mut set = JoinSet::new();
    for (i, (src, dst)) in conversions.into_iter().enumerate() {
        set.spawn(async move {
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
            Err(e) => tracing::error!("convert task failed: {e}"),
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
            return failure(format!("Failed to create output directory: {e:?}"));
        }
    }

    let src_buf = src_path.to_string_lossy().into_owned();
    let tgt_buf = tgt_path.to_string_lossy().into_owned();
    let tgt_io = tgt_buf.clone();
    let ext_buf = ext.clone();

    let res = tokio::task::spawn_blocking(move || {
        encode_image(
            &src_buf,
            &tgt_io,
            &ext_buf,
            quality,
            max_dimension,
            max_bytes,
        )
    })
    .await;

    match res {
        Ok(Ok(())) => json!({ "source_path": source, "output_path": tgt_buf, "error": "" }),
        Ok(Err(e)) => failure(e),
        Err(e) => failure(format!("Task join panicked: {e:?}")),
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
        .map_err(|e| format!("Failed to open source: {e:?}"))?
        .into_dimensions()
        .map_err(|e| format!("Failed to read source dimensions: {e:?}"))?;
    if w > MAX_SOURCE_DIMENSION || h > MAX_SOURCE_DIMENSION {
        return Err(format!(
            "Source exceeds max dimension {MAX_SOURCE_DIMENSION} (got {w}x{h})"
        ));
    }

    let mut img = image::open(source).map_err(|e| format!("Failed to open/decode source: {e:?}"))?;

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
            while bytes.len() as u64 > mb && guard < 32 {
                let (w, h) = img.dimensions();
                if w < 8 || h < 8 {
                    break;
                }
                img = img.resize(w / 2, h / 2, FilterType::Triangle);
                bytes = encode_dynamic(&img, ext, quality)?;
                guard += 1;
            }
        }
    }

    std::fs::write(output, &bytes).map_err(|e| format!("Failed to write output file: {e:?}"))
}

fn encode_dynamic(img: &DynamicImage, ext: &str, quality: u8) -> Result<Vec<u8>, String> {
    let (w, h) = img.dimensions();
    let mut buf = Vec::new();
    match ext {
        "png" => {
            let rgba = img.to_rgba8();
            PngEncoder::new(&mut buf)
                .write_image(&rgba, w, h, ExtendedColorType::Rgba8)
                .map_err(|e| format!("PNG encode failed: {e:?}"))?;
        }
        "jpg" | "jpeg" => {
            let rgb = img.to_rgb8();
            JpegEncoder::new_with_quality(&mut buf, quality)
                .write_image(&rgb, w, h, ExtendedColorType::Rgb8)
                .map_err(|e| format!("JPEG encode failed: {e:?}"))?;
        }
        "webp" => {
            // Lossy VP8 via libwebp (image-webp only ships a lossless encoder).
            // `quality` is now honored — q75 covers land well under the size
            // budget on the first encode, so the shrink loop rarely runs.
            let rgb = img.to_rgb8();
            let encoded = webp::Encoder::from_rgb(&rgb, w, h).encode(quality as f32);
            buf.extend_from_slice(encoded.as_ref());
        }
        "gif" => {
            let rgba = img.to_rgba8();
            GifEncoder::new(&mut buf)
                .write_image(&rgba, w, h, ExtendedColorType::Rgba8)
                .map_err(|e| format!("GIF encode failed: {e:?}"))?;
        }
        "bmp" => {
            let rgba = img.to_rgba8();
            BmpEncoder::new(&mut buf)
                .write_image(&rgba, w, h, ExtendedColorType::Rgba8)
                .map_err(|e| format!("BMP encode failed: {e:?}"))?;
        }
        "tiff" => {
            let rgba = img.to_rgba8();
            let mut cur = Cursor::new(&mut buf);
            TiffEncoder::new(&mut cur)
                .write_image(&rgba, w, h, ExtendedColorType::Rgba8)
                .map_err(|e| format!("TIFF encode failed: {e:?}"))?;
        }
        "qoi" => {
            let rgba = img.to_rgba8();
            QoiEncoder::new(&mut buf)
                .write_image(&rgba, w, h, ExtendedColorType::Rgba8)
                .map_err(|e| format!("QOI encode failed: {e:?}"))?;
        }
        "tga" => {
            let rgba = img.to_rgba8();
            TgaEncoder::new(&mut buf)
                .write_image(&rgba, w, h, ExtendedColorType::Rgba8)
                .map_err(|e| format!("TGA encode failed: {e:?}"))?;
        }
        "pnm" => {
            let rgb = img.to_rgb8();
            PnmEncoder::new(&mut buf)
                .write_image(&rgb, w, h, ExtendedColorType::Rgb8)
                .map_err(|e| format!("PNM encode failed: {e:?}"))?;
        }
        "hdr" => {
            let rgb32f = img.to_rgb32f();
            let bytes = f32_bytes(rgb32f.as_raw());
            HdrEncoder::new(&mut buf)
                .write_image(&bytes, w, h, ExtendedColorType::Rgb32F)
                .map_err(|e| format!("HDR encode failed: {e:?}"))?;
        }
        "ico" => {
            let rgba = img.to_rgba8();
            IcoEncoder::new(&mut buf)
                .write_image(&rgba, w, h, ExtendedColorType::Rgba8)
                .map_err(|e| format!("ICO encode failed: {e:?}"))?;
        }
        _ => unreachable!("ext was pre-validated against ENCODE_FORMATS"),
    }
    Ok(buf)
}

fn f32_bytes(raw: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(raw.len() * 4);
    for v in raw {
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    bytes
}