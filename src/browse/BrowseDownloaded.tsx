/**
 * Solid Browse downloaded-chapters pane. Port of `browse-downloaded.ts`:
 * lists fully-cached chapters for offline reading with a quick filter and
 * local pagination (25/page). The filter resets when leaving the Browse view.
 *
 * Grouping: chapters that belong to a series are grouped by seriesPermalink;
 * orphan chapters (no series) stay as individual rows below the groups.
 */

import { createEffect, createMemo, createSignal, For, Show, type Accessor } from "solid-js";
import { route } from "../stores/router";
import { t } from "../i18n";
import { persistedSignal } from "../lib/persisted-signal";
import { DownloadManager } from "./DownloadManager";
import { getFullyCachedChapters, type FullyCachedChapterRow } from "../db/cache.repo";
import { getBookmarkPermalinks, getHistoryMap } from "../db/library.repo";
import { getBatchCached } from "../db/metadata.repo";
import { isVolumeOrSectionHeader } from "../utils/volume";
import {
  scrollBrowseToTop,
  setPaneLoading,
  setTopPagerFor,
  useDelayedSpinner,
  useTabPane,
} from "./browse-state";
import { Pager } from "../components/Pager";
import { Loading } from "../components/Loading";
import { EmptyState } from "../components/EmptyState";
import { SeriesDownloadedCard } from "./downloaded/SeriesDownloadedCard";
import { OrphanDownloadedCard } from "./downloaded/OrphanDownloadedCard";
import { DownloadedLegend } from "./downloaded/DownloadedLegend";
import { DownloadedToolbar } from "./downloaded/DownloadedToolbar";
import { buildGroups } from "./downloaded/buildGroups";
import type {
  DownloadedSortMode,
  DownloadedModel,
  DownloadedSeriesGroup,
  ProcessedCachedChapter,
} from "./downloaded/types";

const PAGE_SIZE = 15;

export interface BrowseDownloadedProps {
  tabId: string;
  active: Accessor<boolean>;
  revision: Accessor<number>;
  forceTick: Accessor<number>;
}

export function BrowseDownloaded(props: BrowseDownloadedProps) {
  const [currentPage, setCurrentPage] = createSignal(1);
  const [sortMode, setSortMode] = persistedSignal<DownloadedSortMode>("download-desc", {
    name: "ds_downloaded_sort_mode",
  });
  const [query, setQuery] = createSignal("");
  const [inputVal, setInputVal] = createSignal("");
  let debounceTimer: number | null = null;

  const handleInput = (val: string) => {
    setInputVal(val);
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      setQuery(val);
      setCurrentPage(1);
    }, 200);
  };

  createEffect(() => {
    if (route().view !== "browse") {
      setInputVal("");
      setQuery("");
      setCurrentPage(1);
    }
  });

  const pane = useTabPane<DownloadedModel>({
    active: props.active,
    revision: props.revision,
    forceTick: props.forceTick,
    load: async () => {
      const rows = await getFullyCachedChapters();
      const perms = rows.map((r) => r.chapterPermalink);
      const seriesPerms = Array.from(new Set(rows.map((r) => r.seriesPermalink).filter(Boolean)));
      const seriesKeys = seriesPerms.map((p) => `series:${p}`);

      const [bookmarkSet, readHistoryMap, seriesMetaMap] = await Promise.all([
        getBookmarkPermalinks(perms),
        getHistoryMap(perms),
        getBatchCached(seriesKeys),
      ]);

      const volumeMap = new Map<string, string>();
      for (const payload of seriesMetaMap.values()) {
        try {
          const seriesData = JSON.parse(payload);
          let curVolume: string | undefined;
          for (const t of seriesData.taggings ?? []) {
            if (t.header) {
              curVolume = isVolumeOrSectionHeader(t.header) ? t.header : undefined;
            } else if (t.permalink && curVolume) {
              volumeMap.set(t.permalink, curVolume);
            }
          }
        } catch {}
      }

      const readHistorySet = new Set(readHistoryMap.keys());
      return { rows, bookmarkSet, readHistorySet, readHistoryMap, volumeMap };
    },
  });
  const showSpinner = useDelayedSpinner(() => pane.loading());

  createEffect(() => {
    setPaneLoading("downloaded", pane.loading());
  });

  const model = () => pane.data();

  const filteredRows = createMemo<FullyCachedChapterRow[]>(() => {
    const data = model();
    if (!data) return [];
    const q = query().trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter(
      (r: FullyCachedChapterRow) =>
        r.chapterTitle.toLowerCase().includes(q) ||
        (r.seriesName && r.seriesName.toLowerCase().includes(q)) ||
        r.chapterPermalink.toLowerCase().includes(q),
    );
  });
  const grouped = createMemo(() => {
    const data = model();
    return buildGroups(
      filteredRows(),
      data?.readHistoryMap ?? new Map(),
      data?.bookmarkSet ?? new Set(),
      data?.volumeMap ?? new Map(),
      sortMode(),
    );
  });
  // Unified display list: each series group occupies one slot and each orphan
  // chapter occupies its own slot, so pages hold PAGE_SIZE items regardless of
  // how many oneshots exist (previously all orphans rendered on one page).
  type DisplayItem =
    | { kind: "group"; group: DownloadedSeriesGroup }
    | { kind: "orphan"; orphan: ProcessedCachedChapter };
  const displayItems = createMemo<DisplayItem[]>(() => {
    const { groups, orphans } = grouped();
    const items: DisplayItem[] = groups.map((group) => ({ kind: "group", group }));
    for (const orphan of orphans) items.push({ kind: "orphan", orphan });
    return items;
  });

  const totalPages = createMemo(() =>
    Math.max(1, Math.ceil(displayItems().length / PAGE_SIZE)),
  );

  const pagedData = createMemo(() => {
    const start = (currentPage() - 1) * PAGE_SIZE;
    const items = displayItems().slice(start, start + PAGE_SIZE);
    const visibleGroups: DownloadedSeriesGroup[] = [];
    const visibleOrphans: ProcessedCachedChapter[] = [];
    for (const item of items) {
      if (item.kind === "group") visibleGroups.push(item.group);
      else visibleOrphans.push(item.orphan);
    }
    return { visibleGroups, visibleOrphans };
  });

  const visibleGroups = () => pagedData().visibleGroups;
  const visibleOrphans = () => pagedData().visibleOrphans;

  // Clamp the current page when deletions/reloads shrink the page count,
  // otherwise the user is stranded on an empty page with the pager hidden.
  createEffect(() => {
    const pages = totalPages();
    if (currentPage() > pages) setCurrentPage(pages);
  });

  const totalBytes = createMemo(() =>
    filteredRows().reduce((acc: number, r: FullyCachedChapterRow) => acc + r.totalSizeBytes, 0),
  );

  const totalChapters = createMemo(() => filteredRows().length);
  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages()) return;
    setCurrentPage(page);
    scrollBrowseToTop();
  };

  createEffect(() => {
    if (!props.active()) return;
    const pages = totalPages();
    const cur = currentPage();
    setTopPagerFor(props.tabId, {
      totalPages: pages,
      currentPage: cur,
      onPage: (p) => goToPage(p),
    });
  });

  return (
    <div class="ds-tab-pane active" id="ds-tab-downloaded">
      {/* Header Controls Bar */}
      <DownloadedToolbar
        inputId="ds-downloaded-search"
        inputVal={inputVal()}
        onInput={handleInput}
        inputPlaceholder={t("browse.downloaded.filterPlaceholder")}
        onClear={() => {
          setInputVal("");
          setQuery("");
          setCurrentPage(1);
        }}
        sortId="ds-downloaded-sort"
        sortValue={sortMode()}
        onSortChange={(val) => {
          setSortMode(val);
          setCurrentPage(1);
        }}
        sortOptions={[
          { value: "download-desc", label: t("browse.downloaded.sorts.lastDownloaded") },
          { value: "name-asc", label: t("browse.downloaded.sorts.alphabetical") },
          { value: "read-desc", label: t("browse.downloaded.sorts.lastRead") },
        ]}
        totalChapters={totalChapters()}
        totalBytes={totalBytes()}
        countLabel={t("browse.downloaded.sortBy")}
      />

      {/* Download Manager for Active Downloads */}
      <DownloadManager onComplete={() => pane.reload()} />
      {/* Legend */}
      <DownloadedLegend />

      <div id="ds-downloaded-body">
        <Show when={filteredRows().length === 0 && pane.data() !== undefined}>
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

        <Show when={visibleGroups().length > 0 || visibleOrphans().length > 0}>
          <div class="ds-feed-list">
            <For each={visibleGroups()}>
              {(g) => (
                <SeriesDownloadedCard
                  group={g}
                />
              )}
            </For>

            {/* Orphan / Standalone Chapters */}
            <Show when={visibleOrphans().length > 0}>
              <OrphanDownloadedCard
                orphans={visibleOrphans()}
                totalCount={grouped().orphans.length}
              />
            </Show>
          </div>
        </Show>
      </div>

      <div id="ds-downloaded-pager" class="ds-pager-wrap">
        <Show when={totalPages() > 1}>
          <Pager totalPages={totalPages()} currentPage={currentPage()} onPage={(p) => goToPage(p)} cssText="justify-content:flex-end;margin:0;" />
        </Show>
      </div>

      <Show when={showSpinner() && model() === undefined}>
        <Loading message={t("common.loading")} />
      </Show>

    </div>
  );
}
