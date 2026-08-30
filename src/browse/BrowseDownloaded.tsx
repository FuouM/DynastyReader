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
import { GroupBox } from "../components/GroupBox";
import {
  BookIcon,
  CheckIcon,
  PlayIcon,
  ChevronRightIcon,
  StorageIcon,
} from "../components/Icon";
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

function extractChapterLabel(title: string, index?: number, total?: number): string {
  const clean = title.trim();
  const match = clean.match(/(?:chapter|ch\.?|c)\s*(\d+(?:\.\d+)?)/i);
  if (match) return match[1];
  const leadingNum = clean.match(/^(\d+(?:\.\d+)?)/);
  if (leadingNum) return leadingNum[1];
  const anyNum = clean.match(/\b(\d+(?:\.\d+)?)\b/);
  if (anyNum) return anyNum[1];
  if (/oneshot|one-shot/i.test(clean)) return "OS";
  if (/prologue/i.test(clean)) return "Pro";
  if (/epilogue/i.test(clean)) return "Epi";
  if (/extra/i.test(clean)) return "Ex";
  if (clean.length <= 4) return clean;
  if (index !== undefined) return `${index + 1}`;
  if (total === 1) return "1";
  return "1";
}

function SeriesDownloadedCard(props: {
  group: DownloadedSeriesGroup;
  readHistorySet: Set<string>;
  bookmarkSet: Set<string>;
}) {
  const [activeRange, setActiveRange] = createSignal<number>(-1);
  const [isCollapsed, setIsCollapsed] = createSignal<boolean>(false);
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
    <GroupBox
      class="ds-downloaded-series-group ds-mb-8"
      collapsible={true}
      collapsed={isCollapsed()}
      onToggle={() => setIsCollapsed((c) => !c)}
      title={
        <span class="ds-icon-text">
          <BookIcon />
          <span
            class="ds-truncate ds-link-title"
            style="max-width:320px;"
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
          </span>
          <span class="ds-muted" style="font-weight:normal;font-size:11px;">
            ({props.group.chapters.length} ch · {formatBytes(props.group.totalSizeBytes)})
          </span>
        </span>
      }
      actions={
        <div class="ds-downloaded-series-actions">
          <Show when={firstUnread()}>
            {(next) => (
              <button
                type="button"
                class="win-button primary ds-btn-sm"
                onClick={() =>
                  navigate({
                    view: "reader",
                    seriesPermalink: props.group.seriesPermalink,
                    seriesName: props.group.seriesName || props.group.seriesPermalink,
                    chapterPermalink: next().chapterPermalink,
                    chapterTitle: next().chapterTitle,
                  })
                }
                title={`Continue reading: ${next().chapterTitle}`}
              >
                <PlayIcon /> Read Next
              </button>
            )}
          </Show>
          <button
            type="button"
            class="win-button ds-btn-sm"
            onClick={() =>
              navigate({
                view: "series",
                seriesPermalink: props.group.seriesPermalink,
                seriesName: props.group.seriesName || props.group.seriesPermalink,
              })
            }
          >
            Series <ChevronRightIcon />
          </button>
        </div>
      }
    >
      {/* Series Summary Strip */}
      <div class="ds-downloaded-summary-strip">
        <Show when={props.group.coverPath}>
          <img
            src={convertFileSrc(props.group.coverPath!)}
            alt=""
            class="ds-downloaded-cover"
            onClick={() =>
              navigate({
                view: "series",
                seriesPermalink: props.group.seriesPermalink,
                seriesName: props.group.seriesName || props.group.seriesPermalink,
              })
            }
          />
        </Show>
        <div class="ds-downloaded-summary-text ds-muted">
          <span>{props.group.chapters.length} chapters</span>
          <span>·</span>
          <span>{formatBytes(props.group.totalSizeBytes)}</span>
          <span>·</span>
          <span>{formatDate(props.group.lastCachedAt)}</span>
          <Show when={readCount() > 0}>
            <span>·</span>
            <span style="color:var(--sys-primary);font-weight:600;">
              {readCount()}/{props.group.chapters.length} Read
            </span>
          </Show>
        </div>
      </div>

      {/* Range Segment Selector for Large Series (>50 chapters) */}
      <Show when={isLarge()}>
        <div class="ds-chapter-range-bar">
          <span class="ds-muted" style="font-size:11px;margin-right:2px;">Range:</span>
          <button
            type="button"
            class={`win-button ds-btn-sm${activeRange() === -1 ? " active primary" : ""}`}
            onClick={() => setActiveRange(-1)}
          >
            All ({totalChapters()})
          </button>
          <For each={chunks()}>
            {(chunk, idx) => (
              <button
                type="button"
                class={`win-button ds-btn-sm${activeRange() === idx() ? " active primary" : ""}`}
                onClick={() => setActiveRange(idx())}
              >
                {chunk.label}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Cinema Seats Matrix */}
      <div class="ds-chapter-matrix">
        <For each={displayedChapters()}>
          {(ch, idx) => {
            const isRead = () => props.readHistorySet.has(ch.chapterPermalink);
            const isBookmarked = () => props.bookmarkSet.has(ch.chapterPermalink);
            const shortLabel = extractChapterLabel(ch.chapterTitle, idx(), totalChapters());
            const tooltip = `${ch.chapterTitle}\n${ch.pageCount} pages · ${formatBytes(ch.totalSizeBytes)}${isRead() ? " · Read" : " · Unread"}${isBookmarked() ? " · Bookmarked" : ""}\nClick to read offline`;
            return (
              <button
                type="button"
                class={`win-button ds-chapter-seat ${isRead() ? "ds-chapter-seat--read" : "ds-chapter-seat--downloaded"}${isBookmarked() ? " ds-chapter-seat--bookmarked" : ""}`}
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
                  <CheckIcon size={10} class="ds-seat-check" />
                </Show>
                <span>{shortLabel}</span>
              </button>
            );
          }}
        </For>
      </div>
    </GroupBox>
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
  const [currentPage, setCurrentPage] = createSignal(1);
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
      const [bookmarkSet, readHistorySet] = await Promise.all([
        getBookmarkPermalinks(perms),
        getHistoryPermalinks(perms),
      ]);
      return { rows, bookmarkSet, readHistorySet };
    },
  });

  const showSpinner = useDelayedSpinner(() => pane.loading());

  createEffect(() => {
    setPaneLoading("downloaded", pane.loading());
  });

  const model = () => pane.data();

  const filteredRows = () => {
    const data = model();
    if (!data) return [];
    const q = query().trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter(
      (r) =>
        r.chapterTitle.toLowerCase().includes(q) ||
        (r.seriesName && r.seriesName.toLowerCase().includes(q)) ||
        r.chapterPermalink.toLowerCase().includes(q),
    );
  };

  const grouped = () => buildGroups(filteredRows());

  const totalGroupsCount = () =>
    grouped().groups.length + (grouped().orphans.length > 0 ? 1 : 0);

  const totalPages = () => Math.max(1, Math.ceil(totalGroupsCount() / PAGE_SIZE));

  const pagedData = () => {
    const { groups, orphans } = grouped();
    const page = currentPage();
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    const visibleGroups = groups.slice(start, end);
    const orphanIndex = groups.length;
    const showOrphans = orphans.length > 0 && orphanIndex >= start && orphanIndex < end;

    return {
      visibleGroups,
      visibleOrphans: showOrphans ? orphans : [],
    };
  };

  const visibleGroups = () => pagedData().visibleGroups;
  const visibleOrphans = () => pagedData().visibleOrphans;

  const totalBytes = () =>
    filteredRows().reduce((acc, r) => acc + r.totalSizeBytes, 0);

  const totalChapters = () => filteredRows().length;

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
      <div id="ds-downloaded-header" class="ds-toolbar">
        <div id="ds-downloaded-toolbar-left" class="ds-toolbar-row">
          <InputField
            id="ds-downloaded-search"
            value={inputVal()}
            onInput={handleInput}
            placeholder={t("browse.downloaded.filterPlaceholder")}
            onClear={() => {
              setInputVal("");
              setQuery("");
              setCurrentPage(1);
            }}
          />
        </div>

        <div id="ds-downloaded-toolbar-right" class="ds-toolbar-row">
          <span class="ds-muted" id="ds-downloaded-count">
            <StorageIcon />
            <span>
              {t("browse.downloaded.chaptersCount", {
                count: totalChapters(),
                noun: totalChapters() === 1 ? t("browse.downloaded.nounChapter") : t("browse.downloaded.nounChapters"),
              })}
              <Show when={totalChapters() > 0}>
                {" "}({formatBytes(totalBytes())})
              </Show>
            </span>
          </span>
        </div>
      </div>

      {/* Download Manager for Active Downloads */}
      <DownloadManager onComplete={() => pane.reload()} />
      {/* Legend */}
      <div class="ds-downloaded-legend">
        <span class="ds-legend-title">Legend:</span>
        <span class="ds-legend-item">
          <span class="ds-legend-swatch downloaded" />
          <span>Downloaded</span>
        </span>
        <span class="ds-legend-item">
          <span class="ds-legend-swatch read"><CheckIcon size={10} /></span>
          <span>Read</span>
        </span>
        <span class="ds-legend-item">
          <span class="ds-legend-swatch bookmarked" />
          <span>Bookmarked</span>
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
              <GroupBox
                class="ds-downloaded-series-group ds-mb-8"
                title={
                  <span class="ds-icon-text">
                    <BookIcon />
                    <span>Individual Chapters / Oneshots ({visibleOrphans().length})</span>
                  </span>
                }
              >
                <div class="ds-chapter-matrix">
                  <For each={visibleOrphans()}>
                    {(ch, idx) => {
                      const isRead = () =>
                        pane.data()?.readHistorySet.has(ch.chapterPermalink) ?? false;
                      const isBookmarked = () =>
                        pane.data()?.bookmarkSet.has(ch.chapterPermalink) ?? false;
                      const shortLabel = extractChapterLabel(ch.chapterTitle, idx(), visibleOrphans().length);
                      const tooltip = `${ch.chapterTitle}\n${ch.pageCount} pages · ${formatBytes(ch.totalSizeBytes)}${isRead() ? " · Read" : " · Unread"}\nClick to read offline`;

                      return (
                        <button
                          type="button"
                          class={`win-button ds-chapter-seat ${isRead() ? "ds-chapter-seat--read" : "ds-chapter-seat--downloaded"}${isBookmarked() ? " ds-chapter-seat--bookmarked" : ""}`}
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
                            <CheckIcon size={10} class="ds-seat-check" />
                          </Show>
                          <span>{shortLabel}</span>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </GroupBox>
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
