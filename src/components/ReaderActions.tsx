/**
 * Top-bar action buttons for the reader view: Series, Bookmark, Cache Chapter,
 * Copy link, and Open in browser. JSX port of `reader-actions.ts` with
 * identical classes, icons, titles, and behavior.
 */

import { createEffect, createSignal, Show } from "solid-js";
import { debounce } from "@solid-primitives/scheduled";
import { navigate, closeSessionMangaTab } from "../stores/router";
import { showBanner } from "../stores/topbar";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
import { dynastyUrl } from "../utils/url";
import { addBookmark, removeBookmark } from "../db/library.repo";
import { openExternal } from "../api/navigation";
import type { ChapterPage } from "../types/api";
import { Button } from "./Button";
import {
  StorageIcon,
  BookmarkIcon,
  CloudDownloadIcon,
  CheckIcon,
  ExternalLinkIcon,
  CloseIcon,
  Icon,
} from "./Icon";

export interface ReaderActionsController {
  permalink: string;
  seriesPermalink: string | null | (() => string | null);
  seriesName: string | (() => string);
  chapterTitle: string | (() => string);
  currentIndex: number | (() => number);
  pages: ChapterPage[] | (() => ChapterPage[]);
  cachedMap?: Map<number, string>;
  getCachedPath?: (index: number) => string | undefined;
  isPageFailed: (index: number) => boolean;
  enqueue: (index: number) => void;
}

export interface ReaderActionsProps {
  ctrl: ReaderActionsController;
  /** Seeds the bookmark toggle state or reactive accessor. */
  bookmarked: boolean | (() => boolean);
}

export function ReaderActions(props: ReaderActionsProps) {
  const initBookmarked = typeof props.bookmarked === "function" ? props.bookmarked() : props.bookmarked;
  const [bookmarked, setBookmarked] = createSignal(initBookmarked);
  const [pending, setPending] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  createEffect(() => {
    const val = typeof props.bookmarked === "function" ? props.bookmarked() : props.bookmarked;
    setBookmarked(val);
  });
  const unwrap = <T,>(val: T | (() => T)): T => (typeof val === "function" ? (val as () => T)() : val);
  const getSeriesPermalink = () => unwrap(props.ctrl.seriesPermalink);
  const getSeriesName = () => unwrap(props.ctrl.seriesName);
  const getChapterTitle = () => unwrap(props.ctrl.chapterTitle);
  const getCurrentIndex = () => unwrap(props.ctrl.currentIndex);
  const getPagesLength = () => unwrap(props.ctrl.pages).length;

  const isCached = (i: number) => {
    if (props.ctrl.getCachedPath) return props.ctrl.getCachedPath(i) !== undefined;
    if (props.ctrl.cachedMap) return props.ctrl.cachedMap.has(i);
    return false;
  };

  const resetCopied = debounce(() => setCopied(false), 2000);

  const chapterUrl = () => dynastyUrl("chapters", props.ctrl.permalink);

  const toggleBookmark = async () => {
    if (pending()) return;
    setPending(true);
    try {
      if (bookmarked()) {
        await removeBookmark(props.ctrl.permalink);
        setBookmarked(false);
      } else {
        await addBookmark({
          chapterPermalink: props.ctrl.permalink,
          seriesPermalink: getSeriesPermalink() ?? "",
          seriesName: getSeriesName() ?? "",
          chapterTitle: getChapterTitle(),
          pageIndex: getCurrentIndex(),
        });
        setBookmarked(true);
      }
    } catch (err) {
      const msg = errorMessage(err);
      showBanner(t("reader.toolbar.bookmarkErrorBanner", { msg }));
    }
    setPending(false);
  };

  const cacheChapter = () => {
    const total = getPagesLength();
    for (let i = 0; i < total; i++) {
      if (!isCached(i) && !props.ctrl.isPageFailed(i)) props.ctrl.enqueue(i);
    }
    showBanner(t("reader.toolbar.cachingChapterBanner"));
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(chapterUrl());
      setCopied(true);
      showBanner(t("reader.toolbar.copiedLinkBanner"));
      resetCopied.clear();
      resetCopied();
    } catch (err) {
      const msg = errorMessage(err);
      showBanner(t("reader.toolbar.copyLinkErrorBanner", { msg }));
    }
  };

  return (
    <>
      <Show when={getSeriesPermalink()}>
        <Button
          className="ds-btn-icon"
          icon={<StorageIcon />}
          title={t("reader.toolbar.viewSeries")}
          onClick={() =>
            navigate({
              view: "series",
              seriesPermalink: getSeriesPermalink() ?? undefined,
              seriesName: getSeriesName() ?? getChapterTitle(),
            })
          }
        />
      </Show>
      <Button
        className="ds-btn-icon"
        icon={<BookmarkIcon filled={bookmarked()} />}
        title={bookmarked() ? t("reader.toolbar.removeBookmark") : t("reader.toolbar.bookmarkChapter")}
        disabled={pending()}
        onClick={() => void toggleBookmark()}
      />
      <Button
        className="ds-btn-icon"
        icon={<CloudDownloadIcon />}
        title={t("reader.toolbar.cacheChapterTooltip")}
        onClick={cacheChapter}
      />
      <Button
        className="ds-btn-icon"
        icon={copied() ? <CheckIcon /> : <Icon name="link-45deg" />}
        onClick={() => void copyLink()}
      />
      <Button
        className="ds-btn-icon"
        icon={<ExternalLinkIcon />}
        title={t("reader.toolbar.openInBrowser")}
        onClick={() => void openExternal(chapterUrl())}
      />
      <Button
        className="ds-btn-icon"
        icon={<CloseIcon />}
        title={t("topbar.closeTabTooltip")}
        onClick={() => closeSessionMangaTab()}
      />
    </>
  );
}