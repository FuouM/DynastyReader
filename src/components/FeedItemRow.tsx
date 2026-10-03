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

import { createEffect, createMemo, createSignal, onMount, Show, type JSX } from "solid-js";
import { navigate } from "../stores/router";
import { showBanner } from "../stores/topbar";
import { decodeEntities, errorMessage, slugify, canonicalUrl } from "../utils/formatting";
import { categorizeChapterTags, isSeriesKind, seriesTypeToPath, getChapterContainerTag, isDoujinTag } from "../taxonomy";
import { t } from "../i18n";
import { addBookmark, getBookmark, removeBookmark } from "../db/library.repo";
import { getBlacklistMode } from "../db/blacklist.repo";
import type { CollectionItemKind } from "../types/db";
import { browseCovers } from "../browse/browse-covers";
import { BookmarkIcon, CheckIcon, Icon } from "./Icon";
import { Button, ExternalLinkButton, AddToCollectionButton } from "./Button";
import { ListItem } from "./ListItem";
import { HydratedCover } from "./Cover";
import { OfflineBadge, WarningChip } from "./Badges";
import { TagRow } from "./TagRow";
import type { AddToCollectionItem } from "./AddToCollectionModal";
import type { SeriesTag } from "../types/api";
import { useCopyLink } from "../hooks/useCopyLink";

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
  isFollowed?: boolean;
  coverPath?: string | null;
  extraMeta?: JSX.Element;
  onWarn?: (title: string, matchedTags: string[], proceed: () => void) => void;
  onAddToCol: (item: AddToCollectionItem, anchorEl: HTMLElement) => void;
}

export function FeedItemRow(props: FeedItemRowProps) {
  const ch = () => props.item;
  const isBlacklisted = () => props.isBlacklisted ?? false;
  const matchedTags = () => props.matchedTags ?? [];
  const isFullyCached = () => props.isFullyCached ?? false;
  const isRead = () => props.isRead ?? false;
  const isFollowed = () => props.isFollowed ?? false;
  const [bookmarked, setBookmarked] = createSignal(props.isBookmarked ?? false);

  createEffect(() => {
    if (props.isBookmarked !== undefined) {
      setBookmarked(props.isBookmarked);
    }
  });

  onMount(() => {
    if (props.isBookmarked === undefined) {
      void getBookmark(ch().permalink).then((bm) => {
        if (bm) setBookmarked(true);
      });
    }
  });

  const rawTags = createMemo<SeriesTag[]>(() =>
    (ch().tags ?? []).map((t) => ({
      type: t.type || "General",
      name: t.name || "",
      permalink: t.permalink || "",
    })),
  );

  const coverInfo = createMemo(() =>
    browseCovers.getItemCoverInfo({
      permalink: ch().permalink,
      title: ch().title,
      kind: ch().kind,
      series: ch().series || "",
      tags: rawTags(),
    }),
  );
  const containerTag = createMemo(() => getChapterContainerTag(rawTags()));

  const blMode = () => getBlacklistMode();

  const externalUrl = (): string => {
    const cur = ch();
    if (cur.url) return cur.url;
    const path = isSeriesKind(cur.kind) ? seriesTypeToPath(cur.kind) : "chapters";
    return canonicalUrl(path, cur.permalink);
  };
  const { copied, handleCopyLink } = useCopyLink({
    getUrl: externalUrl,
    namespace: "feed-item-row",
  });

  const isDirectSeries = () => isSeriesKind(ch().kind);

  const openMainTarget = (): void => {
    const cur = ch();
    if (isDirectSeries()) {
      openSeries(cur.permalink, cur.title);
    } else {
      openChapter();
    }
  };

  const openChapter = (): void => {
    const cur = ch();
    const ci = coverInfo();
    const ct = containerTag();
    navigate({
      view: "reader",
      chapterPermalink: cur.permalink,
      chapterTitle: cur.title,
      seriesPermalink: ci.seriesPermalink || ct?.permalink || undefined,
      seriesName: ci.seriesName || ct?.name || cur.series || undefined,
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
      const cur = ch();
      const ci = coverInfo();
      if (bookmarked()) {
        await removeBookmark(cur.permalink);
        setBookmarked(false);
        showBanner(t("browse.feed.bookmarkRemovedBanner", { title: cur.title }));
      } else {
        await addBookmark({
          chapterPermalink: cur.permalink,
          seriesPermalink: ci.seriesPermalink || "",
          seriesName: cur.series ?? "",
          chapterTitle: cur.title,
          pageIndex: 0,
        });
        setBookmarked(true);
        showBanner(t("browse.feed.bookmarkSavedBanner", { title: cur.title }));
      }
    } catch (err) {
      const msg = errorMessage(err);
      showBanner(t("browse.feed.bookmarkErrorBanner", { msg }));
    }
  };

  const openAddToCol = (anchorEl: HTMLElement): void => {
    const cur = ch();
    const ci = coverInfo();
    const tags = rawTags();
    if (!ci.isStandalone) {
      const sPermalink =
        ci.seriesPermalink ||
        (cur.series ? slugify(cur.series) : cur.permalink);
      props.onAddToCol(
        {
          permalink: sPermalink,
          title: ci.seriesName || cur.series || cur.title,
          kind: (ci.seriesType === "anthology" ? "anthology" : "series") as CollectionItemKind,
          cover: props.coverPath || ci.coverKey,
        },
        anchorEl,
      );
    } else {
      const cTag = getChapterContainerTag(tags);
      const doujinTag = tags.find((t) => isDoujinTag(t.type));
      const kind: CollectionItemKind = cTag
        ? (cTag.type.toLowerCase() === "anthology" ? "anthology" : "series")
        : doujinTag
          ? "doujin"
          : "oneshot";
      props.onAddToCol(
        {
          permalink: cur.permalink,
          title: cur.title,
          kind,
          cover: props.coverPath || ci.coverKey,
        },
        anchorEl,
      );
    }
  };

  const categorizedTags = createMemo(() => categorizeChapterTags(rawTags()));

  const coverTitle = () => {
    const cur = ch();
    const ci = coverInfo();
    return ci.isStandalone
      ? t("browse.feed.readChapterTooltip", { title: decodeEntities(cur.title) })
      : t("browse.feed.viewSeriesTooltip", { series: decodeEntities(ci.seriesName || ci.seriesPermalink) });
  };

  return (
    <ListItem
      class="ds-feed-item"
      cssText="cursor:pointer;"
      read={isRead()}
      blacklisted={isBlacklisted()}
      followed={isFollowed()}
      onClick={() => guardedOpen(ch().title, openMainTarget)}
      leading={
        <HydratedCover
          path={props.coverPath}
          coverKey={coverInfo().coverKey}
          chapterPermalink={coverInfo().chapterPermalink}
          seriesPermalink={coverInfo().seriesPermalink}
          seriesType={coverInfo().seriesType}
          title={coverTitle()}
          onClick={(ev) => {
            ev.stopPropagation();
            if (isDirectSeries()) {
              guardedOpen(ch().title, () => openSeries(ch().permalink, ch().title));
            } else if (coverInfo().isStandalone) {
              guardedOpen(ch().title, openChapter);
            } else {
              guardedOpen(coverInfo().seriesName || ch().title, () =>
                openSeries(coverInfo().seriesPermalink, coverInfo().seriesName || coverInfo().seriesPermalink),
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
                guardedOpen(ch().title, openMainTarget);
              }}
            >
              <span>{decodeEntities(ch().title)}</span>
              <OfflineBadge when={isFullyCached()} />
            </span>

            <Show when={ch().series && ch().series !== ch().title}>
              <span class="ds-muted ds-text-11">{t("common.in")}</span>
              <span
                class="ds-series-link"
                title={t("browse.feed.goToSeriesTooltip", { series: decodeEntities(ch().series!) })}
                onClick={(ev) => {
                  ev.stopPropagation();
                  guardedOpen(ch().series!, () =>
                    openSeries(coverInfo().seriesPermalink || containerTag()?.permalink || (ch().series ? slugify(ch().series!) : ch().permalink), ch().series!),
                  );
                }}
              >
                {decodeEntities(ch().series!)}
              </span>
            </Show>

            <Show when={props.extraMeta}>
              {props.extraMeta}
            </Show>

            <Show when={isBlacklisted() && matchedTags().length > 0}>
              <WarningChip mode={blMode()} tags={matchedTags()} />
            </Show>
          </div>

          <div class="ds-feed-actions" onClick={(ev) => ev.stopPropagation()}>
            <Button
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
            <Button
              className="ds-btn-icon"
              icon={copied() ? <CheckIcon /> : <Icon name="link-45deg" />}
              title={copied() ? t("common.copied") : t("reader.toolbar.copyLink")}
              onClick={handleCopyLink}
            />
            <AddToCollectionButton
              cssText="flex-shrink:0;"
              title={
                !coverInfo().isStandalone
                  ? t("browse.feed.addSeriesToCollection", { series: decodeEntities(coverInfo().seriesName || ch().series || "") })
                  : t("browse.feed.addToFavoritesOrCustom")
              }
              onOpen={openAddToCol}
            />
            <ExternalLinkButton
              cssText="flex-shrink:0;"
              title={t("browse.feed.openOnDynastyTooltip", { title: decodeEntities(ch().title) })}
              url={externalUrl()}
            />
          </div>
        </div>
      }
      body={
        <>
          <TagRow label={`${t("series.authorsLabel")}:`} tags={categorizedTags().artistTags} />
          <TagRow label={`${t("series.scanlatorsLabel")}:`} tags={categorizedTags().groupTags} />
          <TagRow label={`${t("series.tagsLabel")}:`} tags={categorizedTags().otherTags} />
        </>
      }
    />
  );
}
