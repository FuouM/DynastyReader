/**
 * Individual search result row for BrowseSearch (content items and taxonomic items).
 * Extracted from `BrowseSearch.tsx` for modularity.
 */

import { Show } from "solid-js";
import { navigate } from "../stores";
import { decodeEntities } from "../utils/html";
import { isContentKind, seriesTypeToPath } from "../taxonomy";
import { t } from "../i18n";
import { dynastyUrl } from "../utils/formatting";
import { ListItem } from "../components/ListItem";
import { WarningChip } from "../components/WarningChip";
import { ExternalLinkButton } from "../components/ExternalLinkButton";
import { FeedItemRow } from "../components/FeedItemRow";
import { EntityIcon } from "../components/Icon";
import type { AddToCollectionItem } from "../components/AddToCollectionModal";
import type { SearchResultItem } from "../types/api";
import type { BlacklistMode } from "../db";

export interface SearchRow {
  item: SearchResultItem;
  isBlacklisted: boolean;
  matchedTags: string[];
}

export interface SearchResultRowProps {
  row: SearchRow;
  isFullyCached: boolean;
  blMode: BlacklistMode;
  onWarn: (title: string, matchedTags: string[], proceed: () => void) => void;
  onAddToCol: (item: AddToCollectionItem, anchorEl: HTMLElement) => void;
}

export function SearchResultRow(props: SearchResultRowProps) {
  // ── 1. Content items (Series, Chapters, Doujins, Anthologies, Issues) ────────
  if (isContentKind(props.row.item.kind)) {
    const item = () => props.row.item;
    const itemTags = () => {
      const tags = (item().tags ?? []).map((t) => ({
        type: t.type || "General",
        name: t.name || "",
        permalink: t.permalink || "",
      }));
      if (item().author && !tags.some((t) => t.permalink === item().author!.permalink)) {
        tags.push({ type: "Author", name: item().author!.name, permalink: item().author!.permalink });
      }
      if (item().doujin && !tags.some((t) => t.permalink === item().doujin!.permalink)) {
        tags.push({ type: "Doujin", name: item().doujin!.name, permalink: item().doujin!.permalink });
      }
      return tags;
    };

    const feedData = () => ({
      permalink: item().permalink,
      title: item().title,
      kind: item().kind,
      series: item().kind !== "chapter" ? item().title : null,
      tags: itemTags(),
    });

    const extraMeta = (
      <>
        <span class="ds-muted ds-kind-badge">
          {item().kind}
        </span>
        <Show when={item().releasedOn}>
          <span class="ds-muted ds-text-11">
            {t("browse.search.releasedOn", { date: item().releasedOn })}
          </span>
        </Show>
      </>
    );

    return (
      <FeedItemRow
        item={feedData()}
        isBlacklisted={props.row.isBlacklisted}
        matchedTags={props.row.matchedTags}
        isFullyCached={props.isFullyCached}
        extraMeta={extraMeta}
        onWarn={props.onWarn}
        onAddToCol={props.onAddToCol}
      />
    );
  }

  // ── 2. Taxonomic metadata items (Authors, Scanlators, Tags, Pairings) ────────
  const item = () => props.row.item;
  const isBlacklisted = () => props.row.isBlacklisted;
  const matchedTags = () => props.row.matchedTags;

  const openTaxonomicItem = (): void => {
    if (item().kind === "tag") {
      navigate({
        view: "browse",
        browseTab: "search",
        withTag: item().title,
      });
    } else {
      navigate({
        view: "series",
        seriesPermalink: item().permalink,
        seriesName: item().title,
      });
    }
  };

  return (
    <ListItem
      class="ds-row"
      cssText="gap:8px;padding:4px 8px;cursor:pointer;min-height:30px;align-items:center;"
      blacklisted={isBlacklisted()}
      onClick={openTaxonomicItem}
      leading={
        <div class="ds-entity-icon">
          <EntityIcon kind={item().kind} />
        </div>
      }
      title={
        <div class="ds-flex-row ds-search-title-link--row">
          <span
            class="ds-item-title ds-search-title-link"
          >
            {decodeEntities(item().title)}
          </span>
          <span
            class="ds-muted ds-kind-badge"
          >
            {item().kind}
          </span>
          <Show when={isBlacklisted() && matchedTags().length > 0}>
            <WarningChip mode={props.blMode} tags={matchedTags()} />
          </Show>
        </div>
      }
      actions={
        <ExternalLinkButton
          className="ds-btn-icon"
          title={t("browse.search.openExternalTooltip", { kind: item().kind, title: decodeEntities(item().title) })}
          url={dynastyUrl(seriesTypeToPath(item().kind), item().permalink)}
        />
      }
    />
  );
}
