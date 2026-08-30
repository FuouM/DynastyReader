/**
 * Solid Browse downloaded-chapters pane. Port of `browse-downloaded.ts`:
 * lists fully-cached chapters for offline reading with a quick filter and
 * local pagination (25/page). The filter resets when leaving the Browse view.
 *
 * Grouping: chapters that belong to a series are grouped by seriesPermalink;
 * orphan chapters (no series) stay as individual rows below the groups.
 */

import { createEffect, createSignal, For, Show, type Accessor } from "solid-js";
import { navigate, route } from "../stores";
import { formatBytes } from "../lib/format";
import { formatDate } from "../utils/formatting";
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
import { CloudDownloadIcon, StorageIcon } from "../components/Icon";
import type { AddToCollectionItem } from "../components/AddToCollectionModal";

const PAGE_SIZE = 25;

interface DownloadedModel {
  rows: FullyCachedChapterRow[];
  bookmarkSet: Set<string>;
  readHistorySet: Set<string>;
}

interface DownloadedSeriesGroup {
  seriesPermalink: string;
  seriesName: string | null;
  coverPath: string | null;
  chapters: FullyCachedChapterRow[];
  totalSizeBytes: number;
  lastCachedAt: number;
}

function DownloadedRow(props: {
  ch: FullyCachedChapterRow;
  isBookmarked: boolean;
  isRead: boolean;
  onAddToCol: (item: AddToCollectionItem, anchorEl: HTMLElement) => void;
}) {
  return (
    <FeedItemRow
      item={{
        permalink: props.ch.chapterPermalink,
        title: props.ch.chapterTitle,
        series: props.ch.seriesName,
        tags: props.ch.tags,
      }}
      isBookmarked={props.isBookmarked}
      isRead={props.isRead}
      coverPath={props.ch.coverPath}
      isFullyCached={true}
      extraMeta={
        <>
          <span class="ds-muted">{t("browse.downloaded.pagesCount", { count: props.ch.pageCount })}</span>
          <Show when={props.ch.totalSizeBytes > 0}>
            <span class="ds-muted">· {formatBytes(props.ch.totalSizeBytes)}</span>
          </Show>
          <Show when={props.ch.lastCachedAt > 0}>
            <span class="ds-muted">· {formatDate(props.ch.lastCachedAt)}</span>
          </Show>
        </>
      }
      onAddToCol={props.onAddToCol}
    />
  );
}

function buildGroups(rows: FullyCachedChapterRow[]): { groups: DownloadedSeriesGroup[]; orphans: FullyCachedChapterRow[] } {
  const map = new Map<string, DownloadedSeriesGroup>();
  const orphans: FullyCachedChapterRow[] = [];
  for (const r of rows) {
    if (!r.seriesPermalink) {
      orphans.push(r);
      continue;
    }
    const key = r.seriesPermalink;
    let g = map.get(key);
    if (!g) {
      g = {
        seriesPermalink: key,
        seriesName: r.seriesName,
        coverPath: r.coverPath,
        chapters: [],
        totalSizeBytes: 0,
        lastCachedAt: 0,
      };
      map.set(key, g);
    }
    g.chapters.push(r);
    g.totalSizeBytes += r.totalSizeBytes;
    g.lastCachedAt = Math.max(g.lastCachedAt, r.lastCachedAt);
    if (!g.coverPath && r.coverPath) g.coverPath = r.coverPath;
    if (!g.seriesName && r.seriesName) g.seriesName = r.seriesName;
  }
  for (const g of map.values()) {
    g.chapters.sort((a, b) => a.chapterTitle.localeCompare(b.chapterTitle));
  }
  const groups = Array.from(map.values()).sort((a, b) => b.lastCachedAt - a.lastCachedAt);
  return { groups, orphans };
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
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set());

  createEffect(() => setPaneLoading(props.tabId, pane.loading()));

  createEffect(() => {
    if (route().view !== "browse") {
      setQuery("");
      setPage(1);
    }
  });

  createEffect(() => {
    query();
    setPage(1);
  });

  const filteredRows = (): FullyCachedChapterRow[] => {
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

  const grouped = () => buildGroups(filteredRows());

  // Pager now pages by groups+orphans units: each group counts as 1, each orphan as 1
  const totalUnits = (): number => grouped().groups.length + grouped().orphans.length;
  const totalPages = (): number => Math.max(1, Math.ceil(totalUnits() / PAGE_SIZE));
  const currentPage = (): number => Math.min(page(), totalPages());


  // Simpler pagination for initial: show all groups on page 1 style, but keep pager by groups
  // For correctness with small datasets (<25 groups), pageOrphans calc above handles it; for larger,
  // we show groups per page and orphans only after groups exhausted.
  const visibleGroups = (): DownloadedSeriesGroup[] => {
    const start = (currentPage() - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return grouped().groups.slice(start, end);
  };
  const visibleOrphans = (): FullyCachedChapterRow[] => {
    const groupsLen = grouped().groups.length;
    const start = (currentPage() - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    if (end <= groupsLen) return [];
    if (start >= groupsLen) {
      return grouped().orphans.slice(start - groupsLen, end - groupsLen);
    }
    // Straddling page: groups take start..groupsLen, orphans fill remainder
    return grouped().orphans.slice(0, end - groupsLen);
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

  const totalCount = (): number => pane.data()?.rows.length ?? 0;
  const filteredCount = (): number => filteredRows().length;
  const isFiltering = (): boolean => query().trim().length > 0;

  const totalBytes = (): number =>
    (pane.data()?.rows ?? []).reduce((acc, c) => acc + c.totalSizeBytes, 0);

  const filteredBytes = (): number =>
    filteredRows().reduce((acc, c) => acc + c.totalSizeBytes, 0);

  const model = (): DownloadedModel | undefined => pane.data();

  const toggleGroup = (perm: string): void => {
    const s = new Set(collapsed());
    if (s.has(perm)) s.delete(perm);
    else s.add(perm);
    setCollapsed(s);
  };

  return (
    <div class="ds-tab-pane active" id="ds-tab-downloaded">
      <div id="ds-downloaded-header" class="ds-downloaded-header">
        <div class="ds-downloaded-stats">
          <span class="ds-downloaded-stat-item">
            <CloudDownloadIcon class="ds-downloaded-stat-icon" />
            <span class="ds-downloaded-count">
              <Show
                when={isFiltering()}
                fallback={
                  <>
                    <b>{totalCount()}</b>{" "}
                    {t("browse.downloaded.chaptersCount", {
                      count: "",
                      noun:
                        totalCount() === 1
                          ? t("browse.downloaded.nounChapter")
                          : t("browse.downloaded.nounChapters"),
                    }).trim()}
                  </>
                }
              >
                <b>{filteredCount()}</b> {t("common.of")} <b>{totalCount()}</b>{" "}
                {t("browse.downloaded.chaptersCount", {
                  count: "",
                  noun:
                    totalCount() === 1
                      ? t("browse.downloaded.nounChapter")
                      : t("browse.downloaded.nounChapters"),
                }).trim()}
              </Show>
            </span>
          </span>
          <Show when={totalBytes() > 0}>
            <span class="ds-downloaded-divider">·</span>
            <span class="ds-downloaded-stat-item ds-downloaded-stat-size">
              <StorageIcon class="ds-downloaded-stat-icon" />
              <span class="ds-downloaded-size">
                <b>{formatBytes(isFiltering() ? filteredBytes() : totalBytes())}</b>
                <Show when={isFiltering() && filteredBytes() !== totalBytes()}>
                  <span class="ds-muted"> ({formatBytes(totalBytes())})</span>
                </Show>
              </span>
            </span>
          </Show>
        </div>
        <Show when={isFiltering()}>
          <span class="ds-status-pill fresh">
            {t("common.search") || "Filtered"}
          </span>
        </Show>
      </div>

      <div id="ds-downloaded-filter-wrap" class="ds-mb-8">
        <InputField
          placeholder={t("browse.downloaded.filterPlaceholder")}
          value={query()}
          onInput={setQuery}
          onClear={() => setQuery("")}
        />
      </div>

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
                <div class="ds-downloaded-group" style="border:1px solid var(--ds-border);border-radius:8px;margin-bottom:12px;overflow:hidden;">
                  <div
                    class="ds-downloaded-group-header"
                    style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--ds-surface-2);cursor:pointer;"
                    onClick={() => toggleGroup(g.seriesPermalink)}
                  >
                    <Show when={g.coverPath}>
                      <img src={g.coverPath!} alt="" style="width:42px;height:58px;object-fit:cover;border-radius:4px;flex-shrink:0;" />
                    </Show>
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        {g.seriesName || g.seriesPermalink}
                      </div>
                      <div class="ds-muted" style="font-size:12px;">
                        {g.chapters.length} chapter{g.chapters.length === 1 ? "" : "s"} · {formatBytes(g.totalSizeBytes)} · {formatDate(g.lastCachedAt)}
                      </div>
                    </div>
                    <button
                      class="win-button ds-btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate({ view: "series", seriesPermalink: g.seriesPermalink, seriesName: g.seriesName || g.seriesPermalink });
                      }}
                    >
                      Go to Series →
                    </button>
                    <span class="ds-muted" style="font-size:12px;">
                      {collapsed().has(g.seriesPermalink) ? "▸" : "▾"}
                    </span>
                  </div>
                  <Show when={!collapsed().has(g.seriesPermalink) || g.chapters.length <= 5}>
                    <div class="ds-downloaded-group-chapters" style="padding:4px 0;">
                      <For each={g.chapters}>
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
                  <Show when={collapsed().has(g.seriesPermalink) && g.chapters.length > 5}>
                    <div class="ds-muted" style="padding:8px 12px;font-size:12px;text-align:center;cursor:pointer;" onClick={() => toggleGroup(g.seriesPermalink)}>
                      {g.chapters.length} chapters collapsed — click to expand
                    </div>
                  </Show>
                </div>
              )}
            </For>
            <For each={visibleOrphans()}>
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

      <div id="ds-downloaded-pager" class="ds-pager-wrap">
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
