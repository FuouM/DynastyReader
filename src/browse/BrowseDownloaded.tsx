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
import { convertFileSrc } from "../ipc";
import { formatBytes } from "../lib/format";
import { formatDate } from "../utils/formatting";
import { t } from "../i18n";
import { DownloadManager } from "./DownloadManager";
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
import { EmptyState } from "../components/EmptyState";
import { CloudDownloadIcon, StorageIcon } from "../components/Icon";

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

function extractChapterLabel(title: string): string {
  const clean = title.trim();
  const match = clean.match(/(?:chapter|ch\.?|c)\s*(\d+(?:\.\d+)?)/i);
  if (match) return match[1];
  const leadingNum = clean.match(/^(\d+(?:\.\d+)?)/);
  if (leadingNum) return leadingNum[1];
  if (clean.length <= 5) return clean;
  return clean.slice(0, 4);
}

function SeriesDownloadedCard(props: {
  group: DownloadedSeriesGroup;
  readHistorySet: Set<string>;
  bookmarkSet: Set<string>;
}) {
  const [activeRange, setActiveRange] = createSignal<number>(-1);
  const [expanded, setExpanded] = createSignal<boolean>(false);
  const CHUNK_SIZE = 50;

  const totalChapters = () => props.group.chapters.length;
  const isLarge = () => totalChapters() > CHUNK_SIZE;

  const chunks = () => {
    if (!isLarge()) return [];
    const list: { label: string; start: number; end: number; count: number }[] = [];
    const total = totalChapters();
    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, total);
      list.push({
        label: `${i + 1}–${end}`,
        start: i,
        end,
        count: end - i,
      });
    }
    return list;
  };

  const displayedChapters = () => {
    if (!isLarge() || activeRange() === -1) {
      return props.group.chapters;
    }
    const ch = chunks()[activeRange()];
    if (!ch) return props.group.chapters;
    return props.group.chapters.slice(ch.start, ch.end);
  };

  const readCount = () =>
    props.group.chapters.filter((c) => props.readHistorySet.has(c.chapterPermalink)).length;

  const firstUnread = () =>
    props.group.chapters.find((c) => !props.readHistorySet.has(c.chapterPermalink));

  return (
    <div
      class="ds-downloaded-group"
      style="border:1px solid var(--sys-border-light,#e0e0e0);border-radius:6px;margin-bottom:12px;background:var(--sys-window-bg,#fff);overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);"
    >
      <div
        class="ds-downloaded-group-header"
        style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--sys-surface-2,#f5f6f8);border-bottom:1px solid var(--sys-border-light,#e8e8e8);"
      >
        <Show when={props.group.coverPath}>
          <img
            src={convertFileSrc(props.group.coverPath!)}
            alt=""
            style="width:38px;height:52px;object-fit:cover;border-radius:3px;flex-shrink:0;cursor:pointer;"
            onClick={() =>
              navigate({
                view: "series",
                seriesPermalink: props.group.seriesPermalink,
                seriesName: props.group.seriesName || props.group.seriesPermalink,
              })
            }
          />
        </Show>
        <div style="flex:1;min-width:0;">
          <div
            style="font-weight:600;font-size:13.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
            onClick={() =>
              navigate({
                view: "series",
                seriesPermalink: props.group.seriesPermalink,
                seriesName: props.group.seriesName || props.group.seriesPermalink,
              })
            }
            title={props.group.seriesName || props.group.seriesPermalink}
          >
            {props.group.seriesName || props.group.seriesPermalink}
          </div>
          <div
            class="ds-muted"
            style="font-size:11.5px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:2px;"
          >
            <span>{props.group.chapters.length} chapter{props.group.chapters.length === 1 ? "" : "s"}</span>
            <span>·</span>
            <span>{formatBytes(props.group.totalSizeBytes)}</span>
            <span>·</span>
            <span>{formatDate(props.group.lastCachedAt)}</span>
            <Show when={readCount() > 0}>
              <span>·</span>
              <span style="color:var(--sys-primary,#0078d4);font-weight:600;">
                {readCount()}/{props.group.chapters.length} Read
              </span>
            </Show>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <Show when={firstUnread()}>
            {(next) => (
              <button
                class="win-button ds-btn-sm primary"
                onClick={() =>
                  navigate({
                    view: "reader",
                    seriesPermalink: props.group.seriesPermalink,
                    seriesName: props.group.seriesName || props.group.seriesPermalink,
                    chapterPermalink: next().chapterPermalink,
                    chapterTitle: next().chapterTitle,
                  })
                }
                title={`Continue reading from unread chapter: ${next().chapterTitle}`}
              >
                ▶ Read Next
              </button>
            )}
          </Show>
          <button
            class="win-button ds-btn-sm"
            onClick={() =>
              navigate({
                view: "series",
                seriesPermalink: props.group.seriesPermalink,
                seriesName: props.group.seriesName || props.group.seriesPermalink,
              })
            }
          >
            Go to Series →
          </button>
          <Show when={totalChapters() > 25}>
            <button
              class="win-button ds-btn-sm ds-btn-icon"
              onClick={() => setExpanded((v) => !v)}
              title={expanded() ? "Collapse matrix height" : "Expand matrix height"}
            >
              {expanded() ? "▴" : "▾"}
            </button>
          </Show>
        </div>
      </div>

      {/* Range Segment Selector for Large Series (>50 chapters) */}
      <Show when={isLarge()}>
        <div class="ds-chapter-range-bar">
          <span class="ds-muted" style="font-size:10.5px;margin-right:2px;">Range:</span>
          <button
            class={`ds-range-pill${activeRange() === -1 ? " active" : ""}`}
            onClick={() => setActiveRange(-1)}
          >
            All ({totalChapters()})
          </button>
          <For each={chunks()}>
            {(chunk, idx) => (
              <button
                class={`ds-range-pill${activeRange() === idx() ? " active" : ""}`}
                onClick={() => setActiveRange(idx())}
              >
                {chunk.label}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Cinema Seats Matrix */}
      <div class={`ds-chapter-matrix${expanded() ? " expanded" : ""}`}>
        <For each={displayedChapters()}>
          {(ch) => {
            const isRead = () => props.readHistorySet.has(ch.chapterPermalink);
            const isBookmarked = () => props.bookmarkSet.has(ch.chapterPermalink);
            const shortLabel = extractChapterLabel(ch.chapterTitle);
            const tooltip = `${ch.chapterTitle}\n${ch.pageCount} pages · ${formatBytes(ch.totalSizeBytes)}${isRead() ? " · ✓ Read" : " · Unread"}\nClick to read offline`;

            return (
              <div
                class={`ds-chapter-seat ${isRead() ? "ds-chapter-seat--read" : "ds-chapter-seat--downloaded"}${isBookmarked() ? " ds-chapter-seat--bookmarked" : ""}`}
                title={tooltip}
                onClick={() =>
                  navigate({
                    view: "reader",
                    seriesPermalink: props.group.seriesPermalink,
                    seriesName: props.group.seriesName || props.group.seriesPermalink,
                    chapterPermalink: ch.chapterPermalink,
                    chapterTitle: ch.chapterTitle,
                  })
                }
              >
                <Show when={isRead()}>
                  <span style="font-size:9px;opacity:0.75;line-height:1;">✓</span>
                </Show>
                <span>{shortLabel}</span>
              </div>
            );
          }}
        </For>
      </div>
    </div>
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

      <DownloadManager onComplete={() => pane.reload()} />
      <div id="ds-downloaded-filter-wrap" class="ds-mb-8">
        <InputField
          placeholder={t("browse.downloaded.filterPlaceholder")}
          value={query()}
          onInput={setQuery}
          onClear={() => setQuery("")}
        />
      </div>

      {/* Visual Legend */}
      <div style="display:flex;align-items:center;gap:12px;padding:5px 10px;font-size:11px;color:var(--sys-text-muted,#777);margin-bottom:10px;background:var(--sys-surface-2,#f4f5f7);border:1px solid var(--sys-border-light,#e2e4e8);border-radius:4px;flex-wrap:wrap;">
        <span style="font-weight:600;">Legend:</span>
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--sys-primary,#0078d4);" />
          Downloaded (Ready)
        </span>
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--sys-control-bg,#e9ecef);border:1px solid var(--sys-border-light,#ced4da);" />
          ✓ Read
        </span>
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="color:#ffb703;font-size:11px;line-height:1;">★</span>
          Bookmarked
        </span>
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
                <SeriesDownloadedCard
                  group={g}
                  readHistorySet={pane.data()?.readHistorySet ?? new Set()}
                  bookmarkSet={pane.data()?.bookmarkSet ?? new Set()}
                />
              )}
            </For>

            {/* Orphan / Standalone Chapters */}
            <Show when={visibleOrphans().length > 0}>
              <div
                class="ds-downloaded-group"
                style="border:1px solid var(--sys-border-light,#e0e0e0);border-radius:6px;margin-bottom:12px;background:var(--sys-window-bg,#fff);overflow:hidden;"
              >
                <div
                  class="ds-downloaded-group-header"
                  style="padding:8px 12px;background:var(--sys-surface-2,#f5f6f8);border-bottom:1px solid var(--sys-border-light,#e8e8e8);font-weight:600;font-size:13px;"
                >
                  Individual Chapters / Oneshots ({visibleOrphans().length})
                </div>
                <div class="ds-chapter-matrix">
                  <For each={visibleOrphans()}>
                    {(ch) => {
                      const isRead = () =>
                        pane.data()?.readHistorySet.has(ch.chapterPermalink) ?? false;
                      const isBookmarked = () =>
                        pane.data()?.bookmarkSet.has(ch.chapterPermalink) ?? false;
                      const shortLabel = extractChapterLabel(ch.chapterTitle);
                      const tooltip = `${ch.chapterTitle}\n${ch.pageCount} pages · ${formatBytes(ch.totalSizeBytes)}${isRead() ? " · ✓ Read" : " · Unread"}\nClick to read offline`;

                      return (
                        <div
                          class={`ds-chapter-seat ${isRead() ? "ds-chapter-seat--read" : "ds-chapter-seat--downloaded"}${isBookmarked() ? " ds-chapter-seat--bookmarked" : ""}`}
                          title={tooltip}
                          onClick={() =>
                            navigate({
                              view: "reader",
                              chapterPermalink: ch.chapterPermalink,
                              chapterTitle: ch.chapterTitle,
                            })
                          }
                        >
                          <Show when={isRead()}>
                            <span style="font-size:10px;opacity:0.75;">✓</span>
                          </Show>
                          <span>{shortLabel}</span>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
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
