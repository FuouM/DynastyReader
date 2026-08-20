/**
 * Top-bar action buttons for the reader view: Series, Bookmark, Cache Chapter,
 * Copy link, and Open in browser. JSX port of `reader-actions.ts` with
 * identical classes, icons, titles, and behavior.
 */

import { createSignal, onCleanup, Show } from "solid-js";
import type { ReaderController } from "../reader/reader-controller";
import { navigate, setBanner } from "../state";
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

export interface ReaderActionsProps {
  ctrl: ReaderController;
  /** Seeds the bookmark toggle state. */
  bookmarked: boolean;
}

export function ReaderActions(props: ReaderActionsProps) {
  const [bookmarked, setBookmarked] = createSignal(props.bookmarked);
  const [pending, setPending] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

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
          seriesPermalink: props.ctrl.seriesPermalink ?? "",
          seriesName: props.ctrl.seriesName ?? "",
          chapterTitle: props.ctrl.chapterTitle,
          pageIndex: props.ctrl.currentIndex,
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
    for (let i = 0; i < props.ctrl.pages.length; i++) {
      if (!props.ctrl.cachedMap.has(i) && !props.ctrl.isPageFailed(i)) props.ctrl.enqueue(i);
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
      <Show when={props.ctrl.seriesPermalink}>
        <DsButton
          className=""
          title="Open the containing series"
          onClick={() =>
            navigate({
              view: "series",
              seriesPermalink: props.ctrl.seriesPermalink ?? undefined,
              seriesName: props.ctrl.seriesName ?? props.ctrl.chapterTitle,
            })
          }
        >
          <StorageIcon /> Series
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