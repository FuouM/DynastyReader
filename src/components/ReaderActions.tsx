/**
 * Top-bar action buttons for the reader view: Series, Bookmark, Cache Chapter,
 * Copy link, and Open in browser. JSX port of `reader-actions.ts` with
 * identical classes, icons, titles, and behavior.
 */

import { createSignal, onCleanup, Show } from "solid-js";
import { navigate, setBanner } from "../stores";
import { addBookmark, removeBookmark } from "../db";
import { openExternal } from "../api";
import { DsButton } from "./Button";
import {
  StorageIcon,
  BookmarkIcon,
  CloudDownloadIcon,
  CheckIcon,
  ExternalLinkIcon,
  Icon,
} from "./Icon";

export interface ReaderActionsController {
  permalink: string;
  seriesPermalink: string | null | (() => string | null);
  seriesName: string | (() => string);
  chapterTitle: string | (() => string);
  currentIndex: number | (() => number);
  pages: any[] | (() => any[]);
  cachedMap?: Map<number, string>;
  getCachedPath?: (index: number) => string | undefined;
  isPageFailed: (index: number) => boolean;
  enqueue: (index: number) => void;
}

export interface ReaderActionsProps {
  ctrl: ReaderActionsController;
  /** Seeds the bookmark toggle state. */
  bookmarked: boolean;
}

export function ReaderActions(props: ReaderActionsProps) {
  const [bookmarked, setBookmarked] = createSignal(props.bookmarked);
  const [pending, setPending] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  const getSeriesPermalink = () =>
    typeof props.ctrl.seriesPermalink === "function"
      ? props.ctrl.seriesPermalink()
      : props.ctrl.seriesPermalink;
  const getSeriesName = () =>
    typeof props.ctrl.seriesName === "function"
      ? props.ctrl.seriesName()
      : props.ctrl.seriesName;
  const getChapterTitle = () =>
    typeof props.ctrl.chapterTitle === "function"
      ? props.ctrl.chapterTitle()
      : props.ctrl.chapterTitle;
  const getCurrentIndex = () =>
    typeof props.ctrl.currentIndex === "function"
      ? props.ctrl.currentIndex()
      : props.ctrl.currentIndex;
  const getPagesLength = () =>
    typeof props.ctrl.pages === "function"
      ? props.ctrl.pages().length
      : props.ctrl.pages.length;

  const isCached = (i: number) => {
    if (props.ctrl.getCachedPath) return props.ctrl.getCachedPath(i) !== undefined;
    if (props.ctrl.cachedMap) return props.ctrl.cachedMap.has(i);
    return false;
  };

  let copyTimer: number | null = null;
  onCleanup(() => {
    if (copyTimer !== null) window.clearTimeout(copyTimer);
  });

  const chapterUrl = () => `https://dynasty-scans.com/chapters/${props.ctrl.permalink}`;

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
      const msg = err instanceof Error ? err.message : String(err);
      setBanner(`Bookmark failed: ${msg}`);
    }
    setPending(false);
  };

  const cacheChapter = () => {
    const total = getPagesLength();
    for (let i = 0; i < total; i++) {
      if (!isCached(i) && !props.ctrl.isPageFailed(i)) props.ctrl.enqueue(i);
    }
    setBanner("Caching chapter…");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(chapterUrl());
      setCopied(true);
      setBanner("Copied chapter link to clipboard");
      if (copyTimer !== null) window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBanner(`Copy failed: ${msg}`);
    }
  };

  return (
    <>
      <Show when={getSeriesPermalink()}>
        <DsButton
          className=""
          title="Open the containing series"
          onClick={() =>
            navigate({
              view: "series",
              seriesPermalink: getSeriesPermalink() ?? undefined,
              seriesName: getSeriesName() ?? getChapterTitle(),
            })
          }
        >
          <StorageIcon /> <span class="ds-btn-text">Series</span>
        </DsButton>
      </Show>
      <DsButton
        className=""
        title={bookmarked() ? "Remove bookmark" : "Bookmark this chapter"}
        disabled={pending()}
        onClick={() => void toggleBookmark()}
      >
        <BookmarkIcon filled={bookmarked()} />
      </DsButton>
      <DsButton
        className=""
        title="Download every uncached page of this chapter"
        onClick={cacheChapter}
      >
        <CloudDownloadIcon /> <span class="ds-btn-text">Cache Chapter</span>
      </DsButton>
      <DsButton
        className=""
        title="Copy chapter link to clipboard"
        onClick={() => void copyLink()}
      >
        {copied() ? <CheckIcon /> : <Icon name="link-45deg" />}
      </DsButton>
      <DsButton
        className=""
        title="Open this chapter in your browser"
        onClick={() => void openExternal(chapterUrl())}
      >
        <ExternalLinkIcon />
      </DsButton>
    </>
  );
}