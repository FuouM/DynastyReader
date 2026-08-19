/**
 * Cover thumbnail components with error → placeholder fallback.
 * Replaces the three divergent cover implementations (Library, Series, Cache).
 */

import { el, icon } from "./dom";
import { convertFileSrc } from "../ipc";

/** Builds a cover <img> that falls back to a placeholder on load error. */
export function renderCoverImage(
  path: string | null,
  alt: string,
  imgClass = "ds-cover",
  placeholderClass = "ds-cover-placeholder",
): HTMLElement {
  const isValidLocalPath =
    Boolean(path) &&
    (path!.includes("/") || path!.includes("\\")) &&
    !path!.startsWith("series:") &&
    !path!.startsWith("chapter:");

  if (isValidLocalPath && path) {
    const img = el("img", { class: imgClass, title: alt });
    img.alt = alt;
    img.src = convertFileSrc(path);
    img.addEventListener("error", () => {
      img.style.display = "none";
      img.parentElement?.replaceChild(renderCoverPlaceholder(placeholderClass), img);
    });
    return img;
  }
  return renderCoverPlaceholder(placeholderClass);
}

/** Static placeholder box with a fallback glyph. */
export function renderCoverPlaceholder(
  placeholderClass = "ds-cover-placeholder",
  glyphClass = "bi bi-image",
): HTMLElement {
  const ph = el("div", { class: placeholderClass });
  ph.appendChild(icon(glyphClass));
  return ph;
}

/** Small feed-style cover (42×58) with book-glyph placeholder. */
export function renderFeedCover(path: string | null, coverKey: string, cssText = ""): HTMLElement {
  if (path) {
    const img = el("img", { class: "ds-feed-cover", style: cssText });
    img.alt = coverKey;
    img.width = 42;
    img.height = 58;
    img.decoding = "async";
    img.src = convertFileSrc(path);
    img.addEventListener("error", () => {
      img.style.display = "none";
      img.parentElement?.appendChild(
        el("div", { class: "ds-feed-cover-placeholder", style: cssText }, icon("bi bi-book")),
      );
    });
    return img;
  }
  return el("div", { class: "ds-feed-cover-placeholder", style: cssText }, icon("bi bi-book"));
}
