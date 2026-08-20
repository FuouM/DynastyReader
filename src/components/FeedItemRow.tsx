/**
 * Shared feed item row component used by Recent Releases, Recently Added,
 * and Downloaded tabs.
 *
 * Displays:
 *  - Cover thumbnail (lazy hydrated or local file)
 *  - Title line: chapter title, offline icon, series link, extra metadata (pages/size/date), content warnings
 *  - Artist line with TagPills (72px fixed label)
 *  - Scanlation line with TagPills (72px fixed label)
 *  - Tags line with TagPills (72px fixed label)
 *  - Actions: Bookmark toggle, Add to collection, Open in browser
 */

import { createEffect, createSignal, onMount, Show, type JSX } from "solid-js";
import {
  decodeEntities,
  navigate,
  setBanner,
  sortTagsByCategory,
} from "../stores";
import {
  addBookmark,
  getBlacklistMode,
  getBookmark,
  removeBookmark,
  type CollectionItemKind,
} from "../db";
import { browseCovers } from "../browse/browse-covers";
import { ListItem } from "./ListItem";
import { HydratedCover } from "./HydratedCover";
import { OfflineBadge } from "./OfflineBadge";
import { WarningChip } from "./WarningChip";
import { ExternalLinkButton } from "./ExternalLinkButton";
import { AddToCollectionButton } from "./AddToCollectionButton";
import { TagRow } from "./TagRow";
import type { AddToCollectionItem } from "./AddToCollectionModal";
import type { SeriesTag } from "../types/api";

export interface FeedItemData {
  permalink: string;
  title: string;
  series?: string | null;
  tags?: { type?: string; name?: string; permalink?: string }[];
}

export interface FeedItemRowProps {
  item: FeedItemData;
  isRead?: boolean;
  isBookmarked?: boolean;
  isBlacklisted?: boolean;
  matchedTags?: string[];
  isFullyCached?: boolean;
  coverPath?: string | null;
  extraMeta?: JSX.Element;
  onWarn?: (title: string, matchedTags: string[], proceed: () => void) => void;
  onAddToCol: (item: AddToCollectionItem, anchorEl: HTMLElement) => void;
}

export function FeedItemRow(props: FeedItemRowProps) {
  const ch = props.item;
  const isBlacklisted = () => props.isBlacklisted ?? false;
  const matchedTags = () => props.matchedTags ?? [];
  const isFullyCached = () => props.isFullyCached ?? false;
  const isRead = () => props.isRead ?? false;

  const [bookmarked, setBookmarked] = createSignal(props.isBookmarked ?? false);

  createEffect(() => {
    if (props.isBookmarked !== undefined) {
      setBookmarked(props.isBookmarked);
    }
  });

  onMount(() => {
    if (props.isBookmarked === undefined) {
      void getBookmark(ch.permalink).then((bm) => {
        if (bm) setBookmarked(true);
      });
    }
  });

  const rawTags: SeriesTag[] = (ch.tags ?? []).map((t) => ({
    type: t.type || "General",
    name: t.name || "",
    permalink: t.permalink || "",
  }));

  const coverInfo = browseCovers.getItemCoverInfo({
    permalink: ch.permalink,
    title: ch.title,
    series: ch.series || "",
    tags: rawTags,
  });

  const blMode = getBlacklistMode();

  const openChapter = (): void => {
    navigate({
      view: "reader",
      chapterPermalink: ch.permalink,
      chapterTitle: ch.title,
      seriesPermalink: coverInfo.seriesPermalink || (ch.series ? ch.series.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") : undefined),
      seriesName: coverInfo.seriesName || ch.series || undefined,
    });
  };

  const openSeries = (permalink: string, name: string): void => {
    navigate({
      view: "series",
      seriesPermalink: permalink,
      seriesName: name,
    });
  };

  const guardedOpen = (title: string, proceed: () => void): void => {
    if (isBlacklisted() && matchedTags().length > 0 && props.onWarn) {
      props.onWarn(title, matchedTags(), proceed);
    } else {
      proceed();
    }
  };

  const toggleBookmark = async (): Promise<void> => {
    try {
      if (bookmarked()) {
        await removeBookmark(ch.permalink);
        setBookmarked(false);
        setBanner(`Removed "${ch.title}" from bookmarks.`);
      } else {
        await addBookmark({
          chapterPermalink: ch.permalink,
          seriesPermalink: coverInfo.seriesPermalink || "",
          seriesName: ch.series ?? "",
          chapterTitle: ch.title,
          pageIndex: 0,
        });
        setBookmarked(true);
        setBanner(`Saved "${ch.title}" to Read Later!`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBanner(`Bookmark failed: ${msg}`);
    }
  };

  const openAddToCol = (anchorEl: HTMLElement): void => {
    if (!coverInfo.isStandalone) {
      const sPermalink =
        coverInfo.seriesPermalink ||
        (ch.series ? ch.series.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") : ch.permalink);
      props.onAddToCol(
        {
          permalink: sPermalink,
          title: coverInfo.seriesName || ch.series || ch.title,
          kind: (coverInfo.seriesType === "anthology" ? "anthology" : "series") as CollectionItemKind,
          cover: props.coverPath || coverInfo.coverKey,
        },
        anchorEl,
      );
    } else {
      const doujinTag = rawTags.find((t) => {
        const type = (t.type ?? "").toLowerCase();
        return type === "doujin" || type === "doujinshi";
      });
      const anthologyTag = rawTags.find((t) => (t.type ?? "").toLowerCase() === "anthology");
      const kind: CollectionItemKind = doujinTag
        ? "doujin"
        : anthologyTag
          ? "anthology"
          : "oneshot";
      props.onAddToCol(
        {
          permalink: ch.permalink,
          title: ch.title,
          kind,
          cover: props.coverPath || coverInfo.coverKey,
        },
        anchorEl,
      );
    }
  };

  const artistTags = rawTags.filter((t) => {
    const type = (t.type ?? "").toLowerCase();
    return type === "author" || type === "artist";
  });

  const groupTags = rawTags.filter((t) => {
    const type = (t.type ?? "").toLowerCase();
    return type === "scanlator" || type === "group";
  });

  const otherTags = sortTagsByCategory(
    rawTags.filter((t) => {
      const type = (t.type ?? "").toLowerCase();
      return (
        type !== "author" &&
        type !== "artist" &&
        type !== "scanlator" &&
        type !== "group" &&
        type !== "series"
      );
    }),
  );

  const coverTitle = coverInfo.isStandalone
    ? `Read "${decodeEntities(ch.title)}"`
    : `View series: ${decodeEntities(coverInfo.seriesName || coverInfo.seriesPermalink)}`;

  return (
    <ListItem
      class="ds-feed-item"
      cssText="gap:10px;padding:6px 8px;cursor:pointer;"
      fillCssText="display:flex;flex-direction:column;gap:3px;"
      read={isRead()}
      blacklisted={isBlacklisted()}
      onClick={() => guardedOpen(ch.title, openChapter)}
      leading={
        <HydratedCover
          path={props.coverPath}
          coverKey={coverInfo.coverKey}
          chapterPermalink={coverInfo.chapterPermalink}
          seriesPermalink={coverInfo.seriesPermalink}
          seriesType={coverInfo.seriesType}
          title={coverTitle}
          onClick={(ev) => {
            ev.stopPropagation();
            if (coverInfo.isStandalone) {
              guardedOpen(ch.title, openChapter);
            } else {
              guardedOpen(coverInfo.seriesName || ch.title, () =>
                openSeries(coverInfo.seriesPermalink, coverInfo.seriesName || coverInfo.seriesPermalink),
              );
            }
          }}
        />
      }
      title={
        <div class="ds-flex-row" style="align-items:center;gap:6px;flex-wrap:wrap;">
          <span
            class="ds-item-title"
            style="font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;"
            onClick={(ev) => {
              ev.stopPropagation();
              guardedOpen(ch.title, openChapter);
            }}
          >
            <span>{decodeEntities(ch.title)}</span>
            <OfflineBadge when={isFullyCached()} />
          </span>

          <Show when={ch.series && ch.series !== ch.title}>
            <span class="ds-muted" style="font-size:11px;">in</span>
            <span
              class="ds-series-link"
              title={`Go to series: ${decodeEntities(ch.series!)}`}
              onClick={(ev) => {
                ev.stopPropagation();
                guardedOpen(ch.series!, () =>
                  openSeries(coverInfo.seriesPermalink || ch.series!, ch.series!),
                );
              }}
            >
              {decodeEntities(ch.series!)}
            </span>
          </Show>

          <Show when={props.extraMeta}>
            {props.extraMeta}
          </Show>

          <Show when={isBlacklisted() && matchedTags().length > 0}>
            <WarningChip mode={blMode} tags={matchedTags()} />
          </Show>
        </div>
      }
      body={
        <>
          <TagRow label="Artist:" tags={artistTags} />
          <TagRow label="Scanlation:" tags={groupTags} />
          <TagRow label="Tags:" tags={otherTags} />
        </>
      }
      actions={
        <>
          <button
            type="button"
            class={`win-button ds-btn-compact${bookmarked() ? " primary" : ""}`}
            title={bookmarked() ? "Remove from Read Later" : "Save for Read Later"}
            onClick={(ev) => {
              ev.stopPropagation();
              void toggleBookmark();
            }}
          >
            {bookmarked() ? <i class="bi bi-bookmark-fill"></i> : <i class="bi bi-bookmark-plus"></i>}
            {bookmarked() ? " Saved" : " Read Later"}
          </button>
          <AddToCollectionButton
            cssText="flex-shrink:0;"
            title={
              !coverInfo.isStandalone
                ? `Add series "${decodeEntities(coverInfo.seriesName || ch.series || "")}" to collection`
                : "Add to Favorites or custom collections"
            }
            onOpen={openAddToCol}
          />
          <ExternalLinkButton
            cssText="flex-shrink:0;"
            title={`Open "${decodeEntities(ch.title)}" on Dynasty Scans in browser`}
            url={`https://dynasty-scans.com/chapters/${ch.permalink}`}
          />
        </>
      }
    />
  );
}