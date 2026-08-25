/**
 * Sanitized description helpers — extracted from `SeriesHeader.tsx` (P3-B).
 * Whitelist-based HTML sanitizer for series descriptions; keeps `<p>`, `<br>`,
 * `<a>`, `<b>/<strong>`, `<i>/<em>` and strips everything else to prevent XSS
 * while preserving readable formatting.
 */

import { createMemo, type JSX } from "solid-js";
import { decodeEntities } from "../stores";
import { openExternal } from "../api";

function renderSanitizedNodes(nodes: Node[]): JSX.Element[] {
  const out: JSX.Element[] = [];
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = decodeEntities(node.textContent || "");
      if (text) out.push(text as unknown as JSX.Element);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const kids = () => renderSanitizedNodes(Array.from(el.childNodes));
      if (tag === "p") {
        const children = kids();
        if (children.length > 0) out.push((<p class="ds-series-desc-p">{children}</p>) as unknown as JSX.Element);
      } else if (tag === "br") {
        out.push((<br />) as unknown as JSX.Element);
      } else if (tag === "a") {
        const href = el.getAttribute("href") || "";
        const text = decodeEntities(el.textContent?.trim() || "");
        if (href) {
          out.push(
            (
              <a
                class="ds-external-link"
                title={href}
                onClick={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  void openExternal(href);
                }}
              >
                {text && text !== href ? `${text} — ${href}` : href}
              </a>
            ) as unknown as JSX.Element,
          );
        } else {
          out.push(text as unknown as JSX.Element);
        }
      } else if (tag === "b" || tag === "strong") {
        out.push((<strong>{kids()}</strong>) as unknown as JSX.Element);
      } else if (tag === "i" || tag === "em") {
        out.push((<em>{kids()}</em>) as unknown as JSX.Element);
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

  return (<div class="ds-series-desc">{nodes()}</div>) as unknown as JSX.Element;
}

export function sanitizeDescriptionHtml(html: string): JSX.Element[] {
  if (!html) return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return renderSanitizedNodes(Array.from(doc.body.childNodes));
}
