/**
 * Solid Cache Management view. Port of `ui-cache.ts`:
 *  - overview storage stats grid (disk, pages, chapters, works)
 *  - global maintenance buttons (clear all / pages-only / covers-only)
 *  - granular cached-works list with filter + sort and per-series delete
 */

import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Show,
} from "solid-js";
import { decodeEntities, formatBytes, formatDate, navigate, setActions, showBanner } from "../stores";
import {
  clearAllCacheStorage,
  clearAllCachedPages,
  clearAllCachedCovers,
  clearCachedGroupPages,
  getCacheOverviewStats,
  getCachedSeriesGroups,
  type CachedSeriesGroup,
} from "../db";
import { browseCovers } from "../browse/browse-covers";
import { BackRefreshActions } from "../components/ActionBar";
import { EmptyState } from "../components/EmptyState";
import { HydratedCover } from "../components/HydratedCover";
import { ConfirmDeleteButton } from "../components/Button";
import { Loading } from "../components/Loading";

type CacheData = {
  stats: Awaited<ReturnType<typeof getCacheOverviewStats>>;
  groups: CachedSeriesGroup[];
};

export function CacheView() {
  const [data, { refetch }] = createResource<CacheData>(async () => {
    const [stats, groups] = await Promise.all([getCacheOverviewStats(), getCachedSeriesGroups()]);
    return { stats, groups };
  });

  const [filterText, setFilterText] = createSignal("");
  const [sortMode, setSortMode] = createSignal("size-desc");

  const openItem = (item: CachedSeriesGroup): void => {
    if (item.isStandalone) {
      navigate({
        view: "reader",
        chapterPermalink: item.seriesPermalink,
        chapterTitle: item.seriesName,
      });
    } else {
      navigate({
        view: "series",
        seriesPermalink: item.seriesPermalink,
        seriesName: item.seriesName,
      });
    }
  };

  const purgeAll = async (): Promise<void> => {
    await clearAllCacheStorage();
    browseCovers.clearMemoryCache();
    showBanner("All cache storage successfully purged.");
    void refetch();
  };

  const purgePages = async (): Promise<void> => {
    await clearAllCachedPages();
    showBanner("All cached reader page scans cleared.");
    void refetch();
  };

  const purgeCovers = async (): Promise<void> => {
    await clearAllCachedCovers();
    browseCovers.clearMemoryCache();
    showBanner("All cached covers cleared.");
    void refetch();
  };

  const deleteGroup = async (item: CachedSeriesGroup): Promise<void> => {
    await clearCachedGroupPages(item.chapterPermalinks);
    showBanner(`Cleared cache for "${item.seriesName}".`);
    void refetch();
  };

  const filtered = createMemo<CachedSeriesGroup[]>(() => {
    const groups = data()?.groups ?? [];
    const ft = filterText().toLowerCase().trim();
    const sm = sortMode();

    const out = groups.filter(
      (g) =>
        g.seriesName.toLowerCase().includes(ft) ||
        g.seriesPermalink.toLowerCase().includes(ft),
    );

    out.sort((a, b) => {
      switch (sm) {
        case "size-asc":
          return a.totalSizeBytes - b.totalSizeBytes;
        case "date-asc":
          return a.lastCachedAt - b.lastCachedAt;
        case "date-desc":
          return b.lastCachedAt - a.lastCachedAt;
        case "pages-desc":
          return b.pageCount - a.pageCount;
        case "name-asc":
          return a.seriesName.localeCompare(b.seriesName);
        case "size-desc":
        default:
          return b.totalSizeBytes - a.totalSizeBytes;
      }
    });
    return out;
  });

  // Publish the Back + Refresh top-bar actions once data is ready.
  createEffect(() => {
    if (data() === undefined) return;
    setActions(
      <BackRefreshActions
        backLabel="Back to Library"
        onBack={() => navigate({ view: "library" })}
        onRefresh={() => void refetch()}
      />,
    );
  });

  return (
    <div
      id="ds-cache-view-container"
      style="display:flex;flex-direction:column;gap:12px;padding:8px 4px;width:100%;box-sizing:border-box;"
    >
      <Show when={data.loading && data() === undefined}>
        <Loading />
      </Show>

      <Show when={data.error !== undefined}>
        <div class="ds-row" style="padding:12px;gap:8px;align-items:center;">
          <span class="ds-muted">
            Failed to load cache statistics:{" "}
            {data.error instanceof Error ? data.error.message : String(data.error)}
          </span>
          <button type="button" class="win-button" onClick={() => void refetch()}>
            <i class="bi bi-arrow-clockwise"></i> Retry
          </button>
        </div>
      </Show>

      <Show when={data() !== undefined && data.error === undefined}>
        <CacheBody
          stats={data()!.stats}
          groups={data()!.groups}
          filtered={filtered}
          filterText={filterText}
          setFilterText={setFilterText}
          sortMode={sortMode}
          setSortMode={setSortMode}
          openItem={openItem}
          purgeAll={purgeAll}
          purgePages={purgePages}
          purgeCovers={purgeCovers}
          deleteGroup={deleteGroup}
        />
      </Show>
    </div>
  );
}

function CacheBody(props: {
  stats: CacheData["stats"];
  groups: CachedSeriesGroup[];
  filtered: () => CachedSeriesGroup[];
  filterText: () => string;
  setFilterText: (v: string) => void;
  sortMode: () => string;
  setSortMode: (v: string) => void;
  openItem: (item: CachedSeriesGroup) => void;
  purgeAll: () => Promise<void>;
  purgePages: () => Promise<void>;
  purgeCovers: () => Promise<void>;
  deleteGroup: (item: CachedSeriesGroup) => Promise<void>;
}) {
  const { stats, groups } = props;

  return (
    <>
      <div class="group-box">
        <div class="group-box-title">
          <i class="bi bi-pie-chart"></i> Disk Space &amp; Storage Overview
        </div>
        <div class="ds-stats-grid" style="grid-template-columns: repeat(4, 1fr);">
          <div class="ds-stat-card">
            <span class="ds-stat-val">{formatBytes(stats.totalSizeBytes)}</span>
            <span class="ds-stat-lbl">Disk Space Taken</span>
          </div>
          <div class="ds-stat-card">
            <span class="ds-stat-val">{stats.totalCachedPages}</span>
            <span class="ds-stat-lbl">Cached Page Scans</span>
          </div>
          <div class="ds-stat-card">
            <span class="ds-stat-val">{stats.totalCachedChapters}</span>
            <span class="ds-stat-lbl">Cached Chapters</span>
          </div>
          <div class="ds-stat-card">
            <span class="ds-stat-val">{groups.length}</span>
            <span class="ds-stat-lbl">Cached Works</span>
          </div>
        </div>
      </div>

      <div class="group-box">
        <div class="group-box-title">
          <i class="bi bi-tools"></i> Global Maintenance
        </div>
        <div class="ds-cache-actions">
          <ConfirmDeleteButton
            title="Purge all cached pages, covers, and metadata"
            onConfirm={props.purgeAll}
          >
            <i class="bi bi-trash3"></i> Clear All Cache Storage
          </ConfirmDeleteButton>
          <ConfirmDeleteButton
            title="Purge only high-res reader page scans on disk"
            onConfirm={props.purgePages}
          >
            <i class="bi bi-images"></i> Clear Page Scans Only
          </ConfirmDeleteButton>
          <ConfirmDeleteButton
            title="Purge only cached cover thumbnails on disk"
            onConfirm={props.purgeCovers}
          >
            <i class="bi bi-card-image"></i> Clear Cached Covers Only
          </ConfirmDeleteButton>
        </div>
      </div>

      <div class="group-box" style="display:flex;flex-direction:column;">
        <div class="group-box-title">
          <i class="bi bi-collection"></i> Cached Works &amp; Series ({groups.length})
        </div>

        <Show
          when={groups.length === 0}
          fallback={
            <>
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
                <input
                  type="text"
                  class="win-textbox"
                  placeholder="Filter cached works by name or permalink..."
                  style="flex:1;min-width:200px;"
                  value={props.filterText()}
                  onInput={(ev) => props.setFilterText(ev.currentTarget.value)}
                />
                <div class="ds-flex-row">
                  <span class="ds-item-meta" style="font-size:11px;white-space:nowrap;">
                    Sort by:
                  </span>
                  <select
                    class="win-textbox"
                    style="cursor:pointer;"
                    value={props.sortMode()}
                    onChange={(ev) => props.setSortMode(ev.currentTarget.value)}
                  >
                    <option value="size-desc">Disk Size (Largest first)</option>
                    <option value="size-asc">Disk Size (Smallest first)</option>
                    <option value="date-desc">Date Cached (Newest first)</option>
                    <option value="date-asc">Date Cached (Oldest first)</option>
                    <option value="pages-desc">Page Count (Most pages)</option>
                    <option value="name-asc">Title (A → Z)</option>
                  </select>
                </div>
              </div>

              <div class="ds-cache-list" style="max-height:none;">
                <Show
                  when={props.filtered().length > 0}
                  fallback={
                    <EmptyState cssText="padding:12px;">
                      <span class="ds-muted">No matching cached works found.</span>
                    </EmptyState>
                  }
                >
                  <For each={props.filtered()}>
                    {(item) => (
                      <div class="ds-cache-item" style="padding:8px 10px;">
                        <HydratedCover
                          path={item.coverPath}
                          coverKey={item.seriesName}
                          size="cache"
                          onClick={() => props.openItem(item)}
                        />
                        <div class="ds-fill">
                          <div
                            style="font-size:12px;font-weight:600;cursor:pointer;"
                            onClick={() => props.openItem(item)}
                          >
                            {decodeEntities(item.seriesName)}
                          </div>
                          <div class="ds-item-meta">
                            <strong>{formatBytes(item.totalSizeBytes)}</strong> ·{" "}
                            {item.chapterCount} chapter{item.chapterCount > 1 ? "s" : ""} ·{" "}
                            {item.pageCount} page{item.pageCount > 1 ? "s" : ""} cached · Cached{" "}
                            {formatDate(item.lastCachedAt)}
                          </div>
                        </div>
                        <ConfirmDeleteButton
                          title={`Delete all cached files for "${item.seriesName}"`}
                          onConfirm={() => props.deleteGroup(item)}
                        >
                          <i class="bi bi-trash3"></i>
                        </ConfirmDeleteButton>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </>
          }
        >
          <EmptyState cssText="padding:24px;text-align:center;">
            <span class="ds-muted">No cached chapters or series found on disk.</span>
          </EmptyState>
        </Show>
      </div>
    </>
  );
}