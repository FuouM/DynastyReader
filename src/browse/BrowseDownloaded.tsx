/**
 * Solid Browse downloaded-chapters pane. Port of `browse-downloaded.ts`:
 * lists fully-cached chapters for offline reading with a quick filter and
 * local pagination (25/page). The filter resets when leaving the Browse view.
 */

import { createEffect, createSignal, For, Show, type Accessor } from "solid-js";
import { formatBytes, formatDate, route } from "../stores";
import { t } from "../i18n";
import {
  getFullyCachedChapters,
  getBookmarkPermalinks,
  getHistoryPermalinks,
  type FullyCachedChapterRow,
} from "../db";
import {
  scrollBrowseToTop,
  setPaneLoading,
  setTopPagerFor,
  useDelayedSpinner,
  useTabPane,
} from "./browse-state";
import { Pager } from "../components/Pager";
import { Loading } from "../components/Loading";
import { InputField } from "../components/InputField";
import { FeedItemRow } from "../components/FeedItemRow";
import { EmptyState } from "../components/EmptyState";
import { useAddToCollection } from "../components/hooks/useAddToCollection";
import type { AddToCollectionItem } from "../components/AddToCollectionModal";

const PAGE_SIZE = 25;

interface DownloadedModel {
  rows: FullyCachedChapterRow[];
  bookmarkSet: Set<string>;
  readHistorySet: Set<string>;
}

function DownloadedRow(props: {
  ch: FullyCachedChapterRow;
  isBookmarked: boolean;
  isRead: boolean;
  onAddToCol: (item: AddToCollectionItem, anchorEl: HTMLElement) => void;
}) {
  const { ch } = props;
  return (
    <FeedItemRow
      item={{
        permalink: ch.chapterPermalink,
        title: ch.chapterTitle,
        series: ch.seriesName,
        tags: ch.tags,
      }}
      coverPath={ch.coverPath}
      isFullyCached={true}
      extraMeta={
        <>
          <span class="ds-muted">{t("browse.downloaded.pagesCount", { count: ch.pageCount })}</span>
          <Show when={ch.totalSizeBytes > 0}>
            <span class="ds-muted">· {formatBytes(ch.totalSizeBytes)}</span>
          </Show>
          <Show when={ch.lastCachedAt > 0}>
            <span class="ds-muted">· {formatDate(ch.lastCachedAt)}</span>
          </Show>
        </>
      }
      onAddToCol={props.onAddToCol}
    />
  );
}

export interface BrowseDownloadedProps {
  tabId: string;
  active: Accessor<boolean>;
  revision: Accessor<number>;
  forceTick: Accessor<number>;
}

export function BrowseDownloaded(props: BrowseDownloadedProps) {
  const pane = useTabPane<DownloadedModel>({
    active: props.active,
    revision: props.revision,
    forceTick: props.forceTick,
    load: async (_page) => {
      const rows = await getFullyCachedChapters();
      const permalinks = rows.map((r) => r.chapterPermalink);
      const [bookmarkSet, readHistorySet] = await Promise.all([
        getBookmarkPermalinks(permalinks).catch(() => new Set<string>()),
        getHistoryPermalinks(permalinks).catch(() => new Set<string>()),
      ]);
      return { rows, bookmarkSet, readHistorySet };
    },
  });
  const showSpinner = useDelayedSpinner(pane.loading);

  const [query, setQuery] = createSignal("");
  const [page, setPage] = createSignal(1);
  const addToCol = useAddToCollection();

  createEffect(() => setPaneLoading(props.tabId, pane.loading()));

  // Reset the filter + page when leaving the Browse view (matches
  // `resetDownloadedState`).
  createEffect(() => {
    if (route().view !== "browse") {
      setQuery("");
      setPage(1);
    }
  });

  // Filter changes reset to page 1.
  createEffect(() => {
    query();
    setPage(1);
  });

  const filtered = (): FullyCachedChapterRow[] => {
    const rows = pane.data()?.rows;
    if (!rows) return [];
    const q = query().trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.chapterTitle.toLowerCase().includes(q) ||
        (c.seriesName && c.seriesName.toLowerCase().includes(q)) ||
        c.chapterPermalink.toLowerCase().includes(q),
    );
  };

  const totalPages = (): number => Math.max(1, Math.ceil(filtered().length / PAGE_SIZE));

  const currentPage = (): number => Math.min(page(), totalPages());

  const pageItems = (): FullyCachedChapterRow[] => {
    const start = (currentPage() - 1) * PAGE_SIZE;
    return filtered().slice(start, start + PAGE_SIZE);
  };

  const goToPage = (p: number): void => {
    setPage(p);
    scrollBrowseToTop();
  };

  createEffect(() => {
    setTopPagerFor(props.tabId, {
      totalPages: totalPages(),
      currentPage: currentPage(),
      onPage: (p) => goToPage(p),
    });
  });

  const totalBytes = (): number =>
    (pane.data()?.rows ?? []).reduce((acc, c) => acc + c.totalSizeBytes, 0);

  const model = (): DownloadedModel | undefined => pane.data();

  return (
    <div class="ds-tab-pane active" id="ds-tab-downloaded">
      <div id="ds-downloaded-header">
        <span class="ds-downloaded-count">
          {t("browse.downloaded.chaptersCount", { count: filtered().length, noun: filtered().length === 1 ? t("browse.downloaded.nounChapter") : t("browse.downloaded.nounChapters") })}
          <Show when={totalBytes() > 0}>
            <span class="ds-downloaded-size"> · {formatBytes(totalBytes())}</span>
          </Show>
        </span>
      </div>

      <div id="ds-downloaded-filter-wrap" style="margin-bottom:8px;">
        <InputField
          placeholder={t("browse.downloaded.filterPlaceholder")}
          value={query()}
          onInput={setQuery}
          onClear={() => setQuery("")}
        />
      </div>

      <div id="ds-downloaded-body">
        <Show when={filtered().length === 0 && pane.data() !== undefined}>
          <EmptyState
            cssText="padding:24px;text-align:center;"
            iconName="cloud-arrow-down"
            iconCssText="font-size:28px;opacity:0.6;display:block;margin-bottom:8px;"
          >
            <span class="ds-muted">
              {query().trim()
                ? t("browse.downloaded.noMatching")
                : t("browse.downloaded.emptyTitle")}
            </span>
          </EmptyState>
        </Show>

        <Show when={pageItems().length > 0}>
          <div class="ds-feed-list">
            <For each={pageItems()}>
              {(ch) => (
                <DownloadedRow
                  ch={ch}
                  isBookmarked={pane.data()?.bookmarkSet.has(ch.chapterPermalink) ?? false}
                  isRead={pane.data()?.readHistorySet.has(ch.chapterPermalink) ?? false}
                  onAddToCol={addToCol.onAddToCol}
                />
              )}
            </For>
          </div>
        </Show>
      </div>

      <div id="ds-downloaded-pager" style="display:flex;justify-content:flex-end;margin-top:8px;">
        <Show when={totalPages() > 1}>
          <Pager totalPages={totalPages()} currentPage={currentPage()} onPage={(p) => goToPage(p)} cssText="justify-content:flex-end;margin:0;" />
        </Show>
      </div>

      <Show when={showSpinner() && model() === undefined}>
        <Loading message={t("common.loading")} />
      </Show>

      {addToCol.host}
    </div>
  );
}