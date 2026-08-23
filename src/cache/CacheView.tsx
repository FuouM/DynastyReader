/**
 * Solid Cache Management view. Port of `ui-cache.ts`:
 *  - overview storage stats grid (disk, pages, chapters, works)
 *  - database stats grid (file size, row counts) with wipe/backup
 *  - global maintenance buttons (clear all / pages-only / covers-only)
 *  - granular cached-works list with filter + sort and per-series delete
 */

import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  For,
  Show,
} from "solid-js";
import { decodeEntities, formatBytes, formatDate, navigate, setActions, showBanner } from "../stores";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
import { getSessionTraffic, subscribeSessionTraffic, resetLifetimeTraffic, type SessionTraffic } from "../api";
import {
  clearAllCacheStorage,
  clearAllCachedPages,
  clearAllCachedCovers,
  clearCachedGroupPages,
  getCacheOverviewStats,
  getCachedSeriesGroups,
  getDbStats,
  wipeDatabase,
  backupDatabase,
  restoreDatabaseFromPath,
  type CachedSeriesGroup,
  type DbStats,
} from "../db";
import { browseCovers } from "../browse/browse-covers";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { BackRefreshActions } from "../components/ActionBar";
import { EmptyState } from "../components/EmptyState";
import { HydratedCover } from "../components/HydratedCover";
import { ConfirmDeleteButton, IconButton } from "../components/Button";
import { Loading } from "../components/Loading";
import {
  ChartIcon,
  ToolIcon,
  TrashIcon,
  ImageIcon,
  StorageIcon,
  RefreshIcon,
  DatabaseIcon,
  TrafficIcon,
} from "../components/Icon";

type CacheData = {
  stats: Awaited<ReturnType<typeof getCacheOverviewStats>>;
  groups: CachedSeriesGroup[];
  dbStats: DbStats;
};

export function CacheView() {
  const [traffic, setTraffic] = createSignal<SessionTraffic>(getSessionTraffic());
  onMount(() => {
    const unsub = subscribeSessionTraffic((t) => setTraffic(t));
    onCleanup(unsub);
  });

  const [data, { refetch }] = createResource<CacheData>(async () => {
    const [stats, groups, dbStats] = await Promise.all([getCacheOverviewStats(), getCachedSeriesGroups(), getDbStats()]);
    return { stats, groups, dbStats };
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
    showBanner(t("cache.clearAllSuccess"));
    void refetch();
  };

  const purgePages = async (): Promise<void> => {
    await clearAllCachedPages();
    showBanner(t("cache.clearPagesOnlySuccess"));
    void refetch();
  };

  const purgeCovers = async (): Promise<void> => {
    await clearAllCachedCovers();
    browseCovers.clearMemoryCache();
    showBanner(t("cache.clearCoversOnlySuccess"));
    void refetch();
  };

  const wipeDb = async (): Promise<void> => {
    await wipeDatabase();
    browseCovers.clearMemoryCache();
    showBanner(t("cache.dbWipeSuccess"));
    void refetch();
  };

  const backupDb = async (): Promise<void> => {
    try {
      const res = await backupDatabase();
      showBanner(t("cache.dbBackupSuccess", { path: res.backup_path, size: formatBytes(res.size_bytes) }));
      void refetch();
    } catch (err) {
      showBanner(t("cache.dbBackupError", { msg: errorMessage(err) }));
    }
  };

  const restoreFromPicker = async (): Promise<void> => {
    try {
      let picked: string | string[] | null;
      try {
        picked = await openDialog({
          multiple: false,
          filters: [{ name: "Database", extensions: ["db"] }],
          title: t("cache.dbRestorePickerTitle"),
        });
      } catch (dlgErr) {
        console.error("dynasty-reader: openDialog failed:", dlgErr);
        showBanner(t("cache.dbRestorePickerError", { msg: errorMessage(dlgErr) }));
        return;
      }
      if (!picked || Array.isArray(picked)) return;
      try {
        await restoreDatabaseFromPath(picked);
      } catch (e) {
        console.error("dynasty-reader: restoreDatabaseFromPath failed:", e);
        throw e;
      }
      try {
        browseCovers.clearMemoryCache();
      } catch (e) {
        console.warn("dynasty-reader: clearMemoryCache failed (non-fatal):", e);
      }
      showBanner(t("cache.dbRestoreSuccess", { path: picked as string }));
      void refetch();
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      const msg = errorMessage(err);
      console.error("dynasty-reader: restoreFromPicker failed:", err);
      showBanner(t("cache.dbRestoreError", { msg }));
    }
  };


  const deleteGroup = async (item: CachedSeriesGroup): Promise<void> => {
    await clearCachedGroupPages(item.chapterPermalinks);
    showBanner(t("cache.deletedWorkSuccess", { name: item.seriesName }));
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
        backLabel={t("cache.backToLibrary")}
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
            {t("cache.statsLoadError", { msg: errorMessage(data.error) })}
          </span>
          <IconButton icon={<RefreshIcon />} text={t("common.retry")} onClick={() => void refetch()} />
        </div>
      </Show>

      <Show when={data() !== undefined && data.error === undefined}>
        <CacheBody
          stats={data()!.stats}
          dbStats={data()!.dbStats}
          groups={data()!.groups}
          traffic={traffic}
          filtered={filtered}
          filterText={filterText}
          setFilterText={setFilterText}
          sortMode={sortMode}
          setSortMode={setSortMode}
          openItem={openItem}
          purgeAll={purgeAll}
          purgePages={purgePages}
          purgeCovers={purgeCovers}
          wipeDb={wipeDb}
          backupDb={backupDb}
          restoreFromPicker={restoreFromPicker}
          deleteGroup={deleteGroup}
        />
      </Show>
    </div>
  );
}

function CacheBody(props: {
  stats: CacheData["stats"];
  dbStats: DbStats;
  groups: CachedSeriesGroup[];
  traffic: () => SessionTraffic;
  filtered: () => CachedSeriesGroup[];
  filterText: () => string;
  setFilterText: (v: string) => void;
  sortMode: () => string;
  setSortMode: (v: string) => void;
  openItem: (item: CachedSeriesGroup) => void;
  purgeAll: () => Promise<void>;
  purgePages: () => Promise<void>;
  purgeCovers: () => Promise<void>;
  wipeDb: () => Promise<void>;
  backupDb: () => Promise<void>;
  restoreFromPicker: () => Promise<void>;
  deleteGroup: (item: CachedSeriesGroup) => Promise<void>;
}) {
  const { stats, groups, dbStats, traffic } = props;

  return (
    <>
      <div class="group-box">
        <div class="group-box-title">
          <ChartIcon /> {t("cache.overviewTitle")}
        </div>
        <div class="ds-stats-grid" style="grid-template-columns: repeat(4, 1fr);">
          <div class="ds-stat-card">
            <span class="ds-stat-val">{formatBytes(stats.totalSizeBytes)}</span>
            <span class="ds-stat-lbl">{t("cache.diskFootprint")}</span>
          </div>
          <div class="ds-stat-card">
            <span class="ds-stat-val">{stats.totalCachedPages}</span>
            <span class="ds-stat-lbl">{t("cache.pagesCached")}</span>
          </div>
          <div class="ds-stat-card">
            <span class="ds-stat-val">{stats.totalCachedChapters}</span>
            <span class="ds-stat-lbl">{t("cache.chaptersCached")}</span>
          </div>
          <div class="ds-stat-card">
            <span class="ds-stat-val">{groups.length}</span>
            <span class="ds-stat-lbl">{t("cache.seriesCached")}</span>
          </div>
        </div>
      </div>

      <div class="group-box">
        <div class="group-box-title">
          <DatabaseIcon /> {t("cache.dbStatsTitle")}
        </div>
        <div class="ds-stats-grid" style="grid-template-columns: repeat(4, 1fr);">
          <div class="ds-stat-card">
            <span class="ds-stat-val">{formatBytes(dbStats.file.totalSizeBytes)}</span>
            <span class="ds-stat-lbl">{t("cache.dbSizeTotal")}</span>
          </div>
          <div class="ds-stat-card">
            <span class="ds-stat-val">{formatBytes(dbStats.file.dbSizeBytes)}</span>
            <span class="ds-stat-lbl">{t("cache.dbFile")}</span>
          </div>
          <div class="ds-stat-card">
            <span class="ds-stat-val">{dbStats.totalRows}</span>
            <span class="ds-stat-lbl">{t("cache.totalRecords")}</span>
          </div>
          <div class="ds-stat-card">
            <span class="ds-stat-val">{formatBytes(dbStats.file.walSizeBytes)}</span>
            <span class="ds-stat-lbl">{t("cache.walSize")}</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:2px 16px;margin-top:10px;padding:8px;background:var(--sys-bg-active,#f8f9fa);border:1px solid var(--sys-border-light,#e2e2e2);border-radius:3px;font-size:11px;">
          <span>{t("cache.followedSeriesCount")} <strong>{dbStats.counts.followedSeries}</strong></span>
          <span>{t("cache.readingProgressCount")} <strong>{dbStats.counts.readingProgress}</strong></span>
          <span>{t("cache.historyCount")} <strong>{dbStats.counts.readingHistory}</strong></span>
          <span>{t("cache.bookmarksCount")} <strong>{dbStats.counts.bookmarks}</strong></span>
          <span>{t("cache.collectionsCount")} <strong>{dbStats.counts.collections}</strong> {t("cache.collectionItemsSuffix", { count: dbStats.counts.collectionItems })}</span>
          <span>{t("cache.cachedPagesCount")} <strong>{dbStats.counts.cachedPages}</strong></span>
          <span>{t("cache.cachedMetadataCount")} <strong>{dbStats.counts.cachedMetadata}</strong></span>
          <span>{t("cache.directoryEntriesCount")} <strong>{dbStats.counts.directoryEntries}</strong></span>
          <span>{t("cache.tagBlacklistCount")} <strong>{dbStats.counts.tagBlacklist}</strong></span>
          <span>{t("cache.seriesBlacklistCount")} <strong>{dbStats.counts.seriesBlacklist}</strong></span>
        </div>
        <div class="ds-cache-actions" style="margin-top:10px;">
          <IconButton icon={<DatabaseIcon />} text={t("cache.dbBackup")} title={t("cache.dbBackupTooltip")} onClick={() => void props.backupDb()} />
          <IconButton icon={<RefreshIcon />} text={t("cache.dbRestore")} title={t("cache.dbRestoreTooltip")} onClick={() => void props.restoreFromPicker()} />
          <ConfirmDeleteButton
            icon={<TrashIcon />}
            text={t("cache.dbWipe")}
            title={t("cache.dbWipeTooltip")}
            onConfirm={props.wipeDb}
          />
        </div>
      </div>
      <div class="group-box">
        <div class="group-box-title">
          <TrafficIcon /> {t("cache.trafficTitle")}
        </div>
        <div class="ds-stats-grid" style="grid-template-columns: repeat(4, 1fr);">
          <div class="ds-stat-card">
            <span class="ds-stat-val">{formatBytes(traffic().bytesDownloaded)}</span>
            <span class="ds-stat-lbl">{t("cache.sessionDownloaded", { count: traffic().networkRequests })}</span>
          </div>
          <div class="ds-stat-card">
            <span class="ds-stat-val">{formatBytes(traffic().bytesSaved)}</span>
            <span class="ds-stat-lbl">{t("cache.sessionSaved", { count: traffic().cacheHits })}</span>
          </div>
          <div class="ds-stat-card">
            <span class="ds-stat-val">{formatBytes(traffic().lifetime.bytesDownloaded)}</span>
            <span class="ds-stat-lbl">{t("cache.lifetimeDownloaded", { count: traffic().lifetime.networkRequests })}</span>
          </div>
          <div class="ds-stat-card">
            <span class="ds-stat-val">{formatBytes(traffic().lifetime.bytesSaved)}</span>
            <span class="ds-stat-lbl">{t("cache.lifetimeSaved", { count: traffic().lifetime.cacheHits })}</span>
          </div>
        </div>
        <div class="ds-cache-actions" style="margin-top:10px;">
          <ConfirmDeleteButton
            icon={<TrashIcon />}
            text={t("cache.resetLifetimeStatsButton")}
            title={t("cache.resetLifetimeStatsTooltip")}
            onConfirm={() => {
              resetLifetimeTraffic();
              showBanner(t("cache.resetLifetimeStatsSuccess"));
            }}
          />
        </div>
      </div>
      <div class="group-box">
        <div class="group-box-title">
          <ToolIcon /> {t("cache.maintenanceTitle")}
        </div>
        <div class="ds-cache-actions">
          <ConfirmDeleteButton
            icon={<TrashIcon />}
            text={t("cache.clearAll")}
            title={t("cache.clearAllTooltip")}
            onConfirm={props.purgeAll}
          />
          <ConfirmDeleteButton
            icon={<ImageIcon />}
            text={t("cache.clearPagesOnly")}
            title={t("cache.clearPagesOnlyTooltip")}
            onConfirm={props.purgePages}
          />
          <ConfirmDeleteButton
            icon={<ImageIcon />}
            text={t("cache.clearCoversOnly")}
            title={t("cache.clearCoversOnlyTooltip")}
            onConfirm={props.purgeCovers}
          />
        </div>
      </div>
      <div class="group-box" style="display:flex;flex-direction:column;">
        <div class="group-box-title">
          <StorageIcon /> {t("cache.cachedWorksTitle", { count: groups.length })}
        </div>

        <Show
          when={groups.length === 0}
          fallback={
            <>
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
                <input
                  type="text"
                  class="win-textbox"
                  placeholder={t("cache.filterPlaceholder")}
                  style="flex:1;min-width:200px;"
                  value={props.filterText()}
                  onInput={(ev) => props.setFilterText(ev.currentTarget.value)}
                />
                <div class="ds-flex-row">
                  <span class="ds-item-meta" style="font-size:11px;white-space:nowrap;">
                    {t("cache.sortBy")}
                  </span>
                  <select
                    class="win-textbox"
                    style="cursor:pointer;"
                    value={props.sortMode()}
                    onChange={(ev) => props.setSortMode(ev.currentTarget.value)}
                  >
                    <option value="size-desc">{t("cache.sorts.sizeDesc")}</option>
                    <option value="size-asc">{t("cache.sorts.sizeAsc")}</option>
                    <option value="date-desc">{t("cache.sorts.dateDesc")}</option>
                    <option value="date-asc">{t("cache.sorts.dateAsc")}</option>
                    <option value="pages-desc">{t("cache.sorts.pagesDesc")}</option>
                    <option value="name-asc">{t("cache.sorts.nameAsc")}</option>
                  </select>
                </div>
              </div>

              <div class="ds-cache-list" style="max-height:none;">
                <Show
                  when={props.filtered().length > 0}
                  fallback={
                    <EmptyState cssText="padding:12px;">
                      <span class="ds-muted">{t("cache.noMatchingWorks")}</span>
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
                            {t("cache.cachedWorkMeta", {
                              chapters: item.chapterCount > 1 ? t("cache.chaptersCount", { count: item.chapterCount }) : t("cache.chapterCount", { count: item.chapterCount }),
                              pages: item.pageCount > 1 ? t("cache.pagesCount", { count: item.pageCount }) : t("cache.pageCount", { count: item.pageCount }),
                              date: formatDate(item.lastCachedAt),
                            })}
                          </div>
                        </div>
                        <ConfirmDeleteButton
                          icon={<TrashIcon />}
                          className="ds-btn-icon-sm"
                          title={t("cache.deleteWorkTooltip", { name: item.seriesName })}
                          onConfirm={() => props.deleteGroup(item)}
                        />
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </>
          }
        >
          <EmptyState cssText="padding:24px;text-align:center;">
            <span class="ds-muted">{t("cache.noCachedWorks")}</span>
          </EmptyState>
        </Show>
      </div>
    </>
  );
}