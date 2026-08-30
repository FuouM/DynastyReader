/**
 * Solid Browse downloaded-chapters pane. Port of `browse-downloaded.ts`:
 * lists fully-cached chapters for offline reading with a quick filter and
 * local pagination (25/page). The filter resets when leaving the Browse view.
 *
 * Grouping: chapters that belong to a series are grouped by seriesPermalink;
 * orphan chapters (no series) stay as individual rows below the groups.
 */

import { createEffect, createMemo, createSignal, For, Show, type Accessor } from "solid-js";
import { navigate, route } from "../stores";
import { convertFileSrc } from "../ipc";
import { formatBytes } from "../lib/format";
import { formatDate } from "../utils/formatting";
import { t } from "../i18n";
import { persistedSignal } from "../lib/persisted-signal";
import { DownloadManager } from "./DownloadManager";
import {
  getFullyCachedChapters,
  getBookmarkPermalinks,
  getHistoryMap,
  getBatchCached,
  type FullyCachedChapterRow,
} from "../db";
import { extractVolumeHeader, isVolumeOrSectionHeader } from "../utils/volume";
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
import { DsSelect } from "../components/Button";
import {
  BookIcon,
  CheckIcon,
  PlayIcon,
  ChevronRightIcon,
  StorageIcon,
  ColumnsGapIcon,
  ListCheckIcon,
  BookmarkIcon,
} from "../components/Icon";
const PAGE_SIZE = 15;
export type DownloadedSortMode = "download-desc" | "name-asc" | "read-desc";

interface DownloadedModel {
  rows: FullyCachedChapterRow[];
  bookmarkSet: Set<string>;
  readHistorySet: Set<string>;
  readHistoryMap: Map<string, number>;
  volumeMap: Map<string, string>;
}

export interface ProcessedCachedChapter extends FullyCachedChapterRow {
  shortLabel: string;
  volumeHeader?: string;
  isRead: boolean;
  isBookmarked: boolean;
}
interface DownloadedSeriesGroup {
  seriesPermalink: string;
  seriesName: string | null;
  coverPath: string | null;
  chapters: ProcessedCachedChapter[];
  totalSizeBytes: number;
  lastCachedAt: number;
  lastReadAt: number;
  readCount: number;
}
function isNumberedSeries(group: DownloadedSeriesGroup): boolean {
  const chs = group.chapters;
  if (chs.length === 0) return true;
  let numberedCount = 0;
  for (const ch of chs) {
    const t = ch.chapterTitle.trim();
    if (
      /\b(?:chapter|ch\.?|c)\s*\d+/i.test(t) ||
      /\b(?:volume|vol\.?|v)\s*\d+/i.test(t) ||
      /\b(?:act|episode|ep\.?)\s*\d+/i.test(t) ||
      /^\d+(?:\.\d+)?\b/.test(t)
    ) {
      numberedCount++;
    }
  }
  return numberedCount / chs.length >= 0.5;
}

function extractChapterLabel(title: string, index?: number, total?: number): string {
  const clean = title.trim();
  const match = clean.match(/\b(?:chapter|ch\.?|c)\s*(\d+(?:\.\d+)?)\b/i);
  if (match) return match[1];
  const volMatch = clean.match(/\b(?:volume|vol\.?|v)\s*(\d+(?:\.\d+)?)\b/i);
  if (volMatch) return `V${volMatch[1]}`;
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
}) {
  const isNumbered = createMemo(() => isNumberedSeries(props.group));
  const [viewMode, setViewMode] = createSignal<"seats" | "list">(isNumbered() ? "seats" : "list");
  const [activeRange, setActiveRange] = createSignal<number>(-1);
  const [isCollapsed, setIsCollapsed] = createSignal<boolean>(false);
  const [listLimit, setListLimit] = createSignal<number>(15);
  const CHUNK_SIZE = 50;

  const totalChapters = () => props.group.chapters.length;
  const isLarge = () => totalChapters() > CHUNK_SIZE;

  const chunks = createMemo(() => {
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
  });

  const displayedChapters = createMemo(() => {
    if (viewMode() === "seats") {
      if (!isLarge() || activeRange() === -1) {
        return props.group.chapters;
      }
      const ch = chunks()[activeRange()];
      if (!ch) return props.group.chapters;
      return props.group.chapters.slice(ch.start, ch.end);
    }
    return props.group.chapters;
  });

  const visibleListChapters = createMemo(() => {
    const list = displayedChapters();
    if (listLimit() === -1 || list.length <= 15) return list;
    return list.slice(0, listLimit());
  });

  const hasMultipleVolumes = createMemo(() => {
    const list = props.group.chapters;
    const volSet = new Set<string>();
    for (const ch of list) {
      if (ch.volumeHeader) volSet.add(ch.volumeHeader);
    }
    return volSet.size > 1;
  });

  const readCount = () => props.group.readCount;
  const firstUnread = createMemo(() =>
    props.group.chapters.find((c) => !c.isRead),
  );
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
            ({props.group.chapters.length} ch{props.group.totalSizeBytes > 0 ? ` · ${formatBytes(props.group.totalSizeBytes)}` : ""})
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

          {/* View Mode Toggle (available for all series) */}
          <button
            type="button"
            class="win-button ds-btn-sm ds-btn-icon"
            onClick={() => setViewMode((m) => (m === "seats" ? "list" : "seats"))}
            title={viewMode() === "seats" ? "Switch to detailed chapter list" : "Switch to compact chapter seats matrix"}
          >
            <Show when={viewMode() === "seats"} fallback={<ColumnsGapIcon />}>
              <ListCheckIcon />
            </Show>
          </button>
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
            decoding="async"
            width="32"
            height="44"
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
          <Show when={props.group.totalSizeBytes > 0}>
            <span>·</span>
            <span>{formatBytes(props.group.totalSizeBytes)}</span>
          </Show>
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

      {/* Mode 1: Cinema Seats Matrix */}
      <Show when={viewMode() === "seats"}>
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

        <div class="ds-chapter-matrix">
          <For each={displayedChapters()}>
            {(ch, idx) => {
              const showVolDivider = () => {
                if (!hasMultipleVolumes() || !ch.volumeHeader) return false;
                const list = displayedChapters();
                const i = idx();
                if (i === 0) return false;
                return list[i - 1].volumeHeader !== ch.volumeHeader;
              };
              const tooltip = `${ch.chapterTitle}${ch.volumeHeader ? ` (${ch.volumeHeader})` : ""}\n${ch.pageCount} pages · ${formatBytes(ch.totalSizeBytes)}${ch.isRead ? " · Read" : " · Unread"}${ch.isBookmarked ? " · Bookmarked" : ""}\nClick to read offline`;

              return (
                <>
                  <Show when={showVolDivider()}>
                    <span
                      class="ds-seat-vol-divider"
                      title={ch.volumeHeader}
                      aria-label={ch.volumeHeader}
                    />
                  </Show>
                  <button
                    type="button"
                    class={`win-button ds-chapter-seat ${ch.isRead ? "ds-chapter-seat--read" : "ds-chapter-seat--downloaded"}${ch.isBookmarked ? " ds-chapter-seat--bookmarked" : ""}`}
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
                    <Show when={ch.isRead}>
                      <CheckIcon size={10} class="ds-seat-check" />
                    </Show>
                    <span>{ch.shortLabel}</span>
                  </button>
                </>
              );
            }}
          </For>
        </div>
      </Show>
      {/* Mode 2: Detailed Chapter List */}
      <Show when={viewMode() === "list"}>
        <div class="ds-downloaded-chapter-list">
          <For each={visibleListChapters()}>
            {(ch, idx) => {
              const showVolDivider = () => {
                if (!hasMultipleVolumes() || !ch.volumeHeader) return false;
                const list = visibleListChapters();
                const i = idx();
                return i === 0 || list[i - 1].volumeHeader !== ch.volumeHeader;
              };

              return (
                <>
                  <Show when={showVolDivider()}>
                    <div class="ds-vol-divider">
                      <span>{ch.volumeHeader}</span>
                    </div>
                  </Show>
                  <div
                    class={`ds-chapter-row${ch.isRead ? " ds-chapter-read" : ""}`}
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
                    <div class="ds-chapter-title ds-inline-flex-center-4" style="flex:1;min-width:0;">
                      <Show when={ch.isRead}>
                        <CheckIcon size={11} class="ds-seat-check" style="flex-shrink:0;" />
                      </Show>
                      <Show when={ch.isBookmarked}>
                        <BookmarkIcon filled size={11} style="color:var(--ds-warn-text,#d97706);flex-shrink:0;" />
                      </Show>
                      <span class="ds-truncate" style="font-size:12px;font-weight:500;">{ch.chapterTitle}</span>
                    </div>
                    <div class="ds-chapter-badge ds-muted" style="font-size:11px;font-style:normal;display:flex;gap:6px;align-items:center;flex-shrink:0;">
                      <span>{ch.pageCount}p</span>
                      <Show when={ch.totalSizeBytes > 0}>
                        <span>·</span>
                        <span>{formatBytes(ch.totalSizeBytes)}</span>
                      </Show>
                      <span>·</span>
                      <span>{formatDate(ch.lastCachedAt)}</span>
                    </div>
                  </div>
                </>
              );
            }}
          </For>

          {/* Show more / fewer toggle if > 15 items */}
          <Show when={props.group.chapters.length > 15}>
            <div style="display:flex;justify-content:center;padding:4px 0;margin-top:2px;">
              <button
                type="button"
                class="win-button ds-btn-sm"
                onClick={() => setListLimit((lim) => (lim === -1 ? 15 : -1))}
                style="font-size:11px;padding:1px 10px;"
              >
                {listLimit() === -1
                  ? "Show fewer"
                  : `Show all ${props.group.chapters.length} chapters`}
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </GroupBox>
  );
}

function OrphanDownloadedCard(props: {
  orphans: ProcessedCachedChapter[];
}) {
  const [isCollapsed, setIsCollapsed] = createSignal<boolean>(false);
  const [listLimit, setListLimit] = createSignal<number>(20);

  const visibleOrphans = createMemo(() => {
    if (listLimit() === -1 || props.orphans.length <= 20) return props.orphans;
    return props.orphans.slice(0, listLimit());
  });

  return (
    <GroupBox
      class="ds-downloaded-series-group ds-mb-8"
      collapsible={true}
      collapsed={isCollapsed()}
      onToggle={() => setIsCollapsed((c) => !c)}
      title={
        <span class="ds-icon-text">
          <BookIcon />
          <span>Individual Chapters / Oneshots ({props.orphans.length})</span>
        </span>
      }
    >
      <div class="ds-downloaded-chapter-list">
        <For each={visibleOrphans()}>
          {(ch) => (
            <div
              class={`ds-chapter-row${ch.isRead ? " ds-chapter-read" : ""}`}
              onClick={() =>
                navigate({
                  view: "reader",
                  chapterPermalink: ch.chapterPermalink,
                  chapterTitle: ch.chapterTitle,
                })
              }
            >
              <div class="ds-chapter-title ds-inline-flex-center-4" style="flex:1;min-width:0;">
                <Show when={ch.isRead}>
                  <CheckIcon size={11} class="ds-seat-check" style="flex-shrink:0;" />
                </Show>
                <Show when={ch.isBookmarked}>
                  <BookmarkIcon filled size={11} style="color:var(--ds-warn-text,#d97706);flex-shrink:0;" />
                </Show>
                <span class="ds-truncate" style="font-size:12px;font-weight:500;">{ch.chapterTitle}</span>
              </div>
              <div class="ds-chapter-badge ds-muted" style="font-size:11px;font-style:normal;display:flex;gap:6px;align-items:center;flex-shrink:0;">
                <span>{ch.pageCount}p</span>
                <Show when={ch.totalSizeBytes > 0}>
                  <span>·</span>
                  <span>{formatBytes(ch.totalSizeBytes)}</span>
                </Show>
                <span>·</span>
                <span>{formatDate(ch.lastCachedAt)}</span>
              </div>
            </div>
          )}
        </For>

        {/* Show more / fewer toggle if > 20 items */}
        <Show when={props.orphans.length > 20}>
          <div style="display:flex;justify-content:center;padding:4px 0;margin-top:2px;">
            <button
              type="button"
              class="win-button ds-btn-sm"
              onClick={() => setListLimit((lim) => (lim === -1 ? 20 : -1))}
              style="font-size:11px;padding:1px 10px;"
            >
              {listLimit() === -1
                ? "Show fewer"
                : `Show all ${props.orphans.length} chapters`}
            </button>
          </div>
        </Show>
      </div>
    </GroupBox>
  );
}
function buildGroups(
  rows: FullyCachedChapterRow[],
  readHistoryMap: Map<string, number>,
  bookmarkSet: Set<string>,
  volumeMap: Map<string, string>,
  sortMode: DownloadedSortMode,
): { groups: DownloadedSeriesGroup[]; orphans: ProcessedCachedChapter[] } {
  const map = new Map<string, DownloadedSeriesGroup>();
  const orphans: ProcessedCachedChapter[] = [];
  for (const r of rows) {
    const vol = volumeMap.get(r.chapterPermalink) || extractVolumeHeader(r.chapterTitle);
    const readAt = readHistoryMap.get(r.chapterPermalink) ?? 0;
    const ch: ProcessedCachedChapter = {
      ...r,
      shortLabel: "",
      volumeHeader: vol,
      isRead: readAt > 0,
      isBookmarked: bookmarkSet.has(r.chapterPermalink),
    };
    if (!r.seriesPermalink) {
      orphans.push(ch);
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
        lastReadAt: 0,
        readCount: 0,
      };
      map.set(key, g);
    }
    g.chapters.push(ch);
    g.totalSizeBytes += r.totalSizeBytes;
    if (ch.isRead) g.readCount++;
    g.lastCachedAt = Math.max(g.lastCachedAt, r.lastCachedAt);
    g.lastReadAt = Math.max(g.lastReadAt, readAt);
    if (!g.coverPath && r.coverPath) g.coverPath = r.coverPath;
    if (!g.seriesName && r.seriesName) g.seriesName = r.seriesName;
  }
  for (const g of map.values()) {
    g.chapters.sort((a, b) =>
      a.chapterTitle.localeCompare(b.chapterTitle, undefined, { numeric: true, sensitivity: "base" }),
    );
    const total = g.chapters.length;
    for (let i = 0; i < total; i++) {
      g.chapters[i].shortLabel = extractChapterLabel(
        g.chapters[i].chapterTitle,
        i,
        total,
      );
    }
  }
  const orphanTotal = orphans.length;
  for (let i = 0; i < orphanTotal; i++) {
    orphans[i].shortLabel = extractChapterLabel(orphans[i].chapterTitle, i, orphanTotal);
  }

  const groups = Array.from(map.values());
  if (sortMode === "name-asc") {
    groups.sort((a, b) => {
      const nameA = a.seriesName || a.seriesPermalink;
      const nameB = b.seriesName || b.seriesPermalink;
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: "base" });
    });
    orphans.sort((a, b) =>
      a.chapterTitle.localeCompare(b.chapterTitle, undefined, { numeric: true, sensitivity: "base" }),
    );
  } else if (sortMode === "read-desc") {
    // Most recently read series first; unread series (lastReadAt === 0) after read series
    groups.sort((a, b) => {
      if (b.lastReadAt !== a.lastReadAt) {
        return b.lastReadAt - a.lastReadAt;
      }
      return b.lastCachedAt - a.lastCachedAt;
    });
    orphans.sort((a, b) => {
      const readA = readHistoryMap.get(a.chapterPermalink) ?? 0;
      const readB = readHistoryMap.get(b.chapterPermalink) ?? 0;
      if (readB !== readA) {
        return readB - readA;
      }
      return b.lastCachedAt - a.lastCachedAt;
    });
  } else {
    // "download-desc" (default): newest cached first
    groups.sort((a, b) => b.lastCachedAt - a.lastCachedAt);
    orphans.sort((a, b) => b.lastCachedAt - a.lastCachedAt);
  }

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
  const totalGroupsCount = createMemo(() =>
    grouped().groups.length + (grouped().orphans.length > 0 ? 1 : 0),
  );

  const totalPages = createMemo(() =>
    Math.max(1, Math.ceil(totalGroupsCount() / PAGE_SIZE)),
  );

  const pagedData = createMemo(() => {
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
  });

  const visibleGroups = () => pagedData().visibleGroups;
  const visibleOrphans = () => pagedData().visibleOrphans;

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
          <div class="ds-downloaded-sort-wrap">
            <span class="ds-item-meta ds-nowrap" style="font-size:11.5px;color:var(--sys-text-muted,#666);">
              {t("browse.downloaded.sortBy")}
            </span>
            <DsSelect
              id="ds-downloaded-sort"
              value={sortMode()}
              onChange={(val) => {
                setSortMode(val as DownloadedSortMode);
                setCurrentPage(1);
              }}
              options={[
                { value: "download-desc", label: t("browse.downloaded.sorts.lastDownloaded") },
                { value: "name-asc", label: t("browse.downloaded.sorts.alphabetical") },
                { value: "read-desc", label: t("browse.downloaded.sorts.lastRead") },
              ]}
            />
          </div>
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
                />
              )}
            </For>

            {/* Orphan / Standalone Chapters */}
            <Show when={visibleOrphans().length > 0}>
              <OrphanDownloadedCard
                orphans={visibleOrphans()}
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
