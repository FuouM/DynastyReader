/**
 * Reader persistence — extracted from `reader-session.ts` (continuation of P3-A).
 * Owns `lastPersistedIndex` + `persistDebounced` + `persistNow`/`schedulePersist`.
 * Keeps `ReaderSession` thin; no DOM, no queue. Uses `ReaderState` for currentIndex/atEnd.
 */

import { debounce } from "@solid-primitives/scheduled";
import { isMobile } from "../stores/platform";
import { setReadingProgress } from "../db/library.repo";
import { saveMdxProgress } from "../providers/mangadex/reader";
import { extractMangaDexId } from "../api/navigation";
import { log } from "../utils/log";
import type { ReaderState } from "./reader-state";

export interface ReaderPersistence {
  lastPersistedIndex: number;
  persistNow: () => Promise<void>;
  schedulePersist: () => void;
  dispose: () => void;
}

export function createReaderPersistence(state: ReaderState, permalink: string): ReaderPersistence {
  let lastPersistedIndex = -1;
  let lastPersistedCompleted = false;

  const persistNow = async (): Promise<void> => {
    const pages = state.pages();
    if (pages.length === 0) return;
    const completed = state.atEnd();
    // Skip only when neither the page index nor the completion flag moved —
    // re-opening a finished chapter and scrolling back must un-complete it.
    if (lastPersistedIndex === state.currentIndex() && lastPersistedCompleted === completed) return;
    lastPersistedIndex = state.currentIndex();
    lastPersistedCompleted = completed;
    try {
      if (permalink.startsWith("mdx:")) {
        await saveMdxProgress(
          extractMangaDexId(permalink),
          state.seriesPermalink() ? extractMangaDexId(state.seriesPermalink()!) : "",
          state.seriesName() ?? "",
          state.chapterTitle(),
          state.currentIndex(),
          state.pages().length,
          completed,
        );
      } else {
        await setReadingProgress({
          chapterPermalink: permalink,
          seriesPermalink: state.seriesPermalink() ?? "",
          seriesName: state.seriesName() ?? "",
          chapterTitle: state.chapterTitle(),
          pageIndex: state.currentIndex(),
          pageTotal: state.pages().length,
          completed,
        });
      }
    } catch (err) {
      log.error("reader-persistence", "failed to persist reading progress:", err);
    }
  };

  const persistDebounced = debounce(() => void persistNow(), isMobile() ? 1500 : 400);

  const schedulePersist = (): void => {
    persistDebounced();
  };

  const dispose = (): void => {
    // Flush pending progress before dropping the debounce so closing a
    // chapter inside the debounce window keeps the last-seen page position.
    void persistNow();
    persistDebounced.clear();
  };

  return {
    get lastPersistedIndex() {
      return lastPersistedIndex;
    },
    set lastPersistedIndex(v: number) {
      lastPersistedIndex = v;
    },
    persistNow,
    schedulePersist,
    dispose,
  };
}
