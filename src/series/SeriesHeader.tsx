/**
 * Series header: metadata, categorized tag rows, sanitized description, and cover image.
 */

import { createMemo, For, Show, type JSX } from "solid-js";
import { decodeEntities } from "../stores";
import { t } from "../i18n";
import { openExternal } from "../api";
import type { Series, SeriesTag } from "../types/api";
import { TagPill } from "../components/TagPill";
import { Cover } from "../components/Cover";

export function groupTags(series: Series): {
  authorTags: SeriesTag[];
  groupTags: SeriesTag[];
  doujinTags: SeriesTag[];
  pairingTags: SeriesTag[];
  characterTags: SeriesTag[];
  statusTags: SeriesTag[];
  otherTags: SeriesTag[];
} {
  const authorTags: SeriesTag[] = [];
  const groupMap = new Map<string, SeriesTag>();
  const doujinTags: SeriesTag[] = [];
  const pairingTags: SeriesTag[] = [];
  const characterTags: SeriesTag[] = [];
  const statusTags: SeriesTag[] = [];
  const otherTags: SeriesTag[] = [];

  for (const t of series.tags ?? []) {
    const type = (t.type ?? "").toLowerCase();
    const nameLower = (t.name ?? "").toLowerCase();
    if (type === "author" || type === "artist") {
      authorTags.push(t);
    } else if (type === "scanlator" || type === "group") {
      groupMap.set(t.permalink || t.name, t);
    } else if (
      type === "doujin" ||
      type === "doujinshi" ||
      type === "copyright" ||
      type === "parody"
    ) {
      doujinTags.push(t);
    } else if (type === "pairing") {
      pairingTags.push(t);
    } else if (type === "character") {
      characterTags.push(t);
    } else if (
      type === "status" ||
      type === "format" ||
      nameLower === "oneshot" ||
      nameLower === "one-shot" ||
      nameLower === "anthology" ||
      nameLower === "completed" ||
      nameLower === "ongoing" ||
      nameLower === "discontinued" ||
      nameLower === "hiatus"
    ) {
      statusTags.push(t);
    } else {
      otherTags.push(t);
    }
  }

  // Also collect any scanlation groups from chapter taggings if not in series.tags
  for (const tagging of series.taggings ?? []) {
    for (const t of tagging.tags ?? []) {
      const type = (t.type ?? "").toLowerCase();
      if (type === "scanlator" || type === "group") {
        if (!groupMap.has(t.permalink || t.name)) {
          groupMap.set(t.permalink || t.name, t);
        }
      }
    }
  }
  const groupTags = Array.from(groupMap.values());

  return { authorTags, groupTags, doujinTags, pairingTags, characterTags, statusTags, otherTags };
}

/** Recursively renders a sanitized (tag-whitelist) description tree. */
function renderSanitizedNodes(nodes: Node[]): JSX.Element[] {
  const out: JSX.Element[] = [];
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = decodeEntities(node.textContent || "");
      if (text) out.push(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const kids = () => renderSanitizedNodes(Array.from(el.childNodes));
      if (tag === "p") {
        const children = kids();
        if (children.length > 0) out.push(<p style="margin:4px 0;">{children}</p>);
      } else if (tag === "br") {
        out.push(<br />);
      } else if (tag === "a") {
        const href = el.getAttribute("href") || "";
        const text = decodeEntities(el.textContent?.trim() || "");
        if (href) {
          out.push(
            <a
              class="ds-external-link"
              style="color:var(--sys-primary,#0078d4);text-decoration:underline;cursor:pointer;word-break:break-all;"
              title={href}
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                void openExternal(href);
              }}
            >
              {text && text !== href ? `${text} — ${href}` : href}
            </a>,
          );
        } else {
          out.push(text);
        }
      } else if (tag === "b" || tag === "strong") {
        out.push(<strong>{kids()}</strong>);
      } else if (tag === "i" || tag === "em") {
        out.push(<em>{kids()}</em>);
      } else {
        out.push(...kids());
      }
    }
  }
  return out;
}

export function SanitizedDescription(props: { html: string }) {
  const nodes = createMemo<JSX.Element[]>(() => {
    if (!props.html) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(props.html, "text/html");
    return renderSanitizedNodes(Array.from(doc.body.childNodes));
  });

  return <div class="ds-series-desc">{nodes()}</div>;
}

export function MetaRow(props: { label: string; tags: SeriesTag[] }) {
  return (
    <Show when={props.tags.length > 0}>
      <div class="ds-meta-row">
        <span class="ds-meta-label">{props.label}</span>
        <div class="ds-meta-pills">
          <For each={props.tags}>
            {(t) => <TagPill type={t.type} name={t.name} permalink={t.permalink} compact={false} />}
          </For>
        </div>
      </div>
    </Show>
  );
}

export interface SeriesHeaderProps {
  series: Series;
  coverPath: string | null;
}

export function SeriesHeader(props: SeriesHeaderProps) {
  const tags = createMemo(() => groupTags(props.series));
  const hasMetaRows = createMemo(() => {
    const t = tags();
    return (
      t.authorTags.length > 0 ||
      t.groupTags.length > 0 ||
      t.doujinTags.length > 0 ||
      t.pairingTags.length > 0 ||
      t.characterTags.length > 0 ||
      t.statusTags.length > 0 ||
      t.otherTags.length > 0
    );
  });

  return (
    <div class="ds-series-head">
      <Cover
        path={props.coverPath}
        alt={props.series.name}
        imgClass="ds-cover"
        placeholderClass="ds-cover-placeholder"
      />
      <div class="ds-fill">
        <div style="font-size:14px;font-weight:600;">{decodeEntities(props.series.name)}</div>
        <div class="ds-muted">{props.series.type ?? "Series"}</div>
        <Show when={props.series.description}>
          <SanitizedDescription html={props.series.description!} />
        </Show>
        <Show when={props.series.link}>
          <div class="ds-series-desc" style="margin:4px 0;">
            <a
              class="ds-external-link"
              style="color:var(--sys-primary,#0078d4);text-decoration:underline;cursor:pointer;word-break:break-all;"
              title={props.series.link!}
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                void openExternal(props.series.link!);
              }}
            >
              Official / Source Link — {props.series.link}
            </a>
          </div>
        </Show>
        <Show when={hasMetaRows()}>
          <div class="ds-meta-rows">
            <MetaRow label={`${t("series.authorsLabel")}:`} tags={tags().authorTags} />
            <MetaRow label={`${t("series.scanlatorsLabel")}:`} tags={tags().groupTags} />
            <MetaRow label={`${t("series.doujinLabel")}:`} tags={tags().doujinTags} />
            <MetaRow label={`${t("series.pairingLabel")}:`} tags={tags().pairingTags} />
            <MetaRow label={`${t("series.charactersLabel")}:`} tags={tags().characterTags} />
            <MetaRow label={`${t("series.statusLabel")}:`} tags={tags().statusTags} />
            <MetaRow label={`${t("series.tagsLabel")}:`} tags={tags().otherTags} />
          </div>
        </Show>
      </div>
    </div>
  );
}
