/**
 * Sanitized description helpers — extracted from `SeriesHeader.tsx` (P3-B).
 * Whitelist-based HTML sanitizer for series descriptions; keeps `<p>`, `<br>`,
 * `<a>`, `<b>/<strong>`, `<i>/<em>` and strips everything else to prevent XSS
 * while preserving readable formatting.
 */

import { createMemo, type JSX } from "solid-js";
import { decodeEntities } from "../utils/html";
import { openExternal } from "../api/navigation";

/** Wraps a value as a JSX.Element (SolidJS requires this coercion for mixed text/element arrays). */
const el = (v: JSX.Element): JSX.Element => v as JSX.Element;

function renderSanitizedNodes(nodes: Node[]): JSX.Element[] {
  const out: JSX.Element[] = [];
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = decodeEntities(node.textContent || "");
      if (text) out.push(el(text));
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const htmlEl = node as HTMLElement;
      const tag = htmlEl.tagName.toLowerCase();
      const kids = () => renderSanitizedNodes(Array.from(htmlEl.childNodes));
      if (tag === "p") {
        const children = kids();
        if (children.length > 0) out.push(el(<p class="ds-series-desc-p">{children}</p>));
      } else if (tag === "br") {
        out.push(el(<br />));
      } else if (tag === "a") {
        const href = htmlEl.getAttribute("href") || "";
        const text = decodeEntities(htmlEl.textContent?.trim() || "");
        // Scheme-validate before rendering: javascript:/file:/custom protocols
        // must never reach openExternal (Tauri shell open → OS handler).
        const safeHref = /^https?:\/\//i.test(href) ? href : "";
        if (safeHref) {
          out.push(
            el(
              <a
                class="ds-external-link"
                title={safeHref}
                onClick={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  void openExternal(safeHref);
                }}
              >
                {text && text !== safeHref ? `${text} — ${safeHref}` : safeHref}
              </a>,
            ),
          );
        } else {
          out.push(el(text));
        }
      } else if (tag === "b" || tag === "strong") {
        out.push(el(<strong>{kids()}</strong>));
      } else if (tag === "i" || tag === "em") {
        out.push(el(<em>{kids()}</em>));
      } else {
        out.push(...kids());
      }
    }
  }
  return out;
}

export function SanitizedDescription(props: { html: string }): JSX.Element {
  const nodes = createMemo<JSX.Element[]>(() => {
    if (!props.html) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(props.html, "text/html");
    return renderSanitizedNodes(Array.from(doc.body.childNodes));
  });

  return el(<div class="ds-series-desc">{nodes()}</div>);
}

