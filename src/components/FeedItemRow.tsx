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
import { debounce } from "@solid-primitives/scheduled";
import {
  navigate,
  setBanner,
  SITE_ROOT,
} from "../stores";
import { decodeEntities } from "../utils/html";
import { categorizeChapterTags, isSeriesKind, seriesTypeToPath, getChapterContainerTag, isDoujinTag } from "../taxonomy";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
import {
  addBookmark,
  getBlacklistMode,
  getBookmark,
  removeBookmark,
  type CollectionItemKind,
} from "../db";
import { browseCovers } from "../browse/browse-covers";
import { BookmarkIcon, CheckIcon, Icon } from "./Icon";
import { IconButton } from "./Button";
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
  kind?: "chapter" | "series" | "anthology" | "doujin" | "issue" | "author" | "scanlator" | "tag" | "pairing";
  series?: string | null;
  tags?: { type?: string; name?: string; permalink?: string }[];
  url?: string;
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
    kind: ch.kind,
    series: ch.series || "",
    tags: rawTags,
  });

  const blMode = getBlacklistMode();

  const externalUrl = (): string => {
    if (ch.url) return ch.url;
    const path = isSeriesKind(ch.kind) ? seriesTypeToPath(ch.kind) : "chapters";
    return `${SITE_ROOT}/${path}/${ch.permalink}`;
  };
  const [copied, setCopied] = createSignal(false);
  const resetCopied = debounce(() => setCopied(false), 2000);

  const copyLink = async (ev: MouseEvent): Promise<void> => {
    ev.stopPropagation();
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(externalUrl());
        setCopied(true);
        setBanner(t("reader.toolbar.copiedLinkBanner"));
        resetCopied();
      }
    } catch (err) {
      console.warn("[FeedItemRow] copy link failed:", err);
      const msg = errorMessage(err);
      setBanner(t("reader.toolbar.copyLinkErrorBanner", { msg }));
    }
  };

  const isDirectSeries = isSeriesKind(ch.kind);

  const openMainTarget = (): void => {
    if (isDirectSeries) {
      openSeries(ch.permalink, ch.title);
    } else {
      openChapter();
    }
  };

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
        setBanner(t("browse.feed.bookmarkRemovedBanner", { title: ch.title }));
      } else {
        await addBookmark({
          chapterPermalink: ch.permalink,
          seriesPermalink: coverInfo.seriesPermalink || "",
          seriesName: ch.series ?? "",
          chapterTitle: ch.title,
          pageIndex: 0,
        });
        setBookmarked(true);
        setBanner(t("browse.feed.bookmarkSavedBanner", { title: ch.title }));
      }
    } catch (err) {
      const msg = errorMessage(err);
      setBanner(t("browse.feed.bookmarkErrorBanner", { msg }));
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
      const containerTag = getChapterContainerTag(rawTags);
      const doujinTag = rawTags.find((t) => isDoujinTag(t.type));
      const kind: CollectionItemKind = containerTag
        ? (containerTag.type.toLowerCase() === "anthology" ? "anthology" : "series")
        : doujinTag
          ? "doujin"
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

  const { artistTags, groupTags, otherTags } = categorizeChapterTags(rawTags);

  const coverTitle = coverInfo.isStandalone
    ? t("browse.feed.readChapterTooltip", { title: decodeEntities(ch.title) })
    : t("browse.feed.viewSeriesTooltip", { series: decodeEntities(coverInfo.seriesName || coverInfo.seriesPermalink) });

  return (
    <ListItem
      class="ds-feed-item"
      cssText="cursor:pointer;"
      read={isRead()}
      blacklisted={isBlacklisted()}
      onClick={() => guardedOpen(ch.title, openMainTarget)}
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
            if (isDirectSeries) {
              guardedOpen(ch.title, () => openSeries(ch.permalink, ch.title));
            } else if (coverInfo.isStandalone) {
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
        <div class="ds-feed-title-row">
          <div class="ds-flex-row ds-feed-title-main">
            <span
              class="ds-item-title ds-feed-title"
              onClick={(ev) => {
                ev.stopPropagation();
                guardedOpen(ch.title, openMainTarget);
              }}
            >
              <span>{decodeEntities(ch.title)}</span>
              <OfflineBadge when={isFullyCached()} />
            </span>

            <Show when={ch.series && ch.series !== ch.title}>
              <span class="ds-muted ds-text-11">{t("common.in")}</span>
              <span
                class="ds-series-link"
                title={t("browse.feed.goToSeriesTooltip", { series: decodeEntities(ch.series!) })}
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

          <div class="ds-feed-actions" onClick={(ev) => ev.stopPropagation()}>
            <IconButton
              icon={<BookmarkIcon filled={bookmarked()} />}
              text={bookmarked() ? t("browse.feed.saved") : t("browse.feed.readLater")}
              textClass="ds-action-btn-text"
              className={`ds-btn-compact${bookmarked() ? " primary" : ""}`}
              title={bookmarked() ? t("browse.feed.removeFromReadLater") : t("browse.feed.saveForReadLater")}
              onClick={(ev) => {
                ev.stopPropagation();
                void toggleBookmark();
              }}
            />
            <IconButton
              className="ds-btn-icon"
              icon={copied() ? <CheckIcon /> : <Icon name="link-45deg" />}
              title={copied() ? t("common.copied") : t("reader.toolbar.copyLink")}
              onClick={copyLink}
            />
            <AddToCollectionButton
              cssText="flex-shrink:0;"
              title={
                !coverInfo.isStandalone
                  ? t("browse.feed.addSeriesToCollection", { series: decodeEntities(coverInfo.seriesName || ch.series || "") })
                  : t("browse.feed.addToFavoritesOrCustom")
              }
              onOpen={openAddToCol}
            />
            <ExternalLinkButton
              cssText="flex-shrink:0;"
              title={t("browse.feed.openOnDynastyTooltip", { title: decodeEntities(ch.title) })}
              url={externalUrl()}
            />
          </div>
        </div>
      }
      body={
        <>
          <TagRow label={`${t("series.authorsLabel")}:`} tags={artistTags} />
          <TagRow label={`${t("series.scanlatorsLabel")}:`} tags={groupTags} />
          <TagRow label={`${t("series.tagsLabel")}:`} tags={otherTags} />
        </>
      }
    />
  );
}