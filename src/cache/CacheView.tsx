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
import { navigate, setActions, showBanner } from "../stores";
import { formatBytes } from "../lib/format";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
import { getSessionTraffic, subscribeSessionTraffic, resetLifetimeTraffic, type SessionTraffic } from "../api";
import {
  clearCachedGroupPages,
  getCacheOverviewStats,
  getFullyCachedChapters,
  getBookmarkPermalinks,
  getHistoryMap,
  getBatchCached,
  getDbStats,
  type FullyCachedChapterRow,
  type DbStats,
  type CacheOverviewStats,
} from "../db";
import {
  SeriesDownloadedCard,
  OrphanDownloadedCard,
  buildGroups,
  type DownloadedSortMode,
  type DownloadedSeriesGroup,
  type ProcessedCachedChapter,
} from "../browse/downloaded";
import { isVolumeOrSectionHeader } from "../utils/volume";
import { Pager } from "../components/Pager";
import { BackRefreshActions } from "../components/ActionBar";
import { EmptyState } from "../components/EmptyState";
import { GroupBox } from "../components/GroupBox";
import { ConfirmDeleteButton, DsSelect, IconText, IconButton, StatCard } from "../components/Button";
import { useCacheActions } from "./useCacheActions";
import { InputField } from "../components/InputField";
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
  CheckIcon,
} from "../components/Icon";

type CacheData = {
  stats: CacheOverviewStats;
  dbStats: DbStats;
  rows: FullyCachedChapterRow[];
  bookmarkSet: Set<string>;
  readHistoryMap: Map<string, number>;
  volumeMap: Map<string, string>;
};

export function CacheView() {
  const [traffic, setTraffic] = createSignal<SessionTraffic>(getSessionTraffic());
  onMount(() => {
    const unsub = subscribeSessionTraffic((t) => setTraffic(t));
    onCleanup(unsub);
  });

  const [data, { refetch }] = createResource<CacheData>(async () => {
    const [stats, dbStats, rows] = await Promise.all([
      getCacheOverviewStats(),
      getDbStats(),
      getFullyCachedChapters(),
    ]);

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

    return { stats, dbStats, rows, bookmarkSet, readHistoryMap, volumeMap };
  });

  const PAGE_SIZE = 15;
  const [currentPage, setCurrentPage] = createSignal(1);
  const [filterText, setFilterText] = createSignal("");
  const [inputVal, setInputVal] = createSignal("");
  const [sortMode, setSortMode] = createSignal<DownloadedSortMode>("size-desc");
  let debounceTimer: number | undefined;

  const handleInput = (val: string) => {
    setInputVal(val);
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      setFilterText(val);
      setCurrentPage(1);
    }, 200);
  };

  const { purgeAll, purgePages, purgeCovers, wipeDb, backupDb, restoreFromPicker } = useCacheActions(
    refetch as unknown as () => void,
  );

  const deleteSeries = async (group: DownloadedSeriesGroup): Promise<void> => {
    const perms = group.chapters.map((c) => c.chapterPermalink);
    await clearCachedGroupPages(perms);
    showBanner(t("cache.deletedWorkSuccess", { name: group.seriesName || group.seriesPermalink }));
    void refetch();
  };

  const deleteChapter = async (chapterPermalink: string): Promise<void> => {
    await clearCachedGroupPages([chapterPermalink]);
    showBanner("Cached chapter cleared");
    void refetch();
  };

  const deleteAllOrphans = async (orphans: ProcessedCachedChapter[]): Promise<void> => {
    const perms = orphans.map((o) => o.chapterPermalink);
    await clearCachedGroupPages(perms);
    showBanner("Cleared standalone cached chapters");
    void refetch();
  };

  const filteredRows = createMemo<FullyCachedChapterRow[]>(() => {
    const d = data();
    if (!d) return [];
    const q = filterText().trim().toLowerCase();
    if (!q) return d.rows;
    return d.rows.filter(
      (r: FullyCachedChapterRow) =>
        r.chapterTitle.toLowerCase().includes(q) ||
        (r.seriesName && r.seriesName.toLowerCase().includes(q)) ||
        r.chapterPermalink.toLowerCase().includes(q),
    );
  });

  const grouped = createMemo(() => {
    const d = data();
    return buildGroups(
      filteredRows(),
      d?.readHistoryMap ?? new Map(),
      d?.bookmarkSet ?? new Set(),
      d?.volumeMap ?? new Map(),
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

  const totalBytes = createMemo(() =>
    filteredRows().reduce((acc: number, r: FullyCachedChapterRow) => acc + r.totalSizeBytes, 0),
  );
  const totalChapters = createMemo(() => filteredRows().length);

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
      class="ds-cache-view"
    >
      <Show when={data.loading && data() === undefined}>
        <Loading />
      </Show>

      <Show when={data.error !== undefined}>
        <div class="ds-error-row">
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
          totalWorks={grouped().groups.length + (grouped().orphans.length > 0 ? 1 : 0)}
          traffic={traffic}
          hasRows={data()!.rows.length > 0}
          filteredRowsCount={filteredRows().length}
          visibleGroups={pagedData().visibleGroups}
          visibleOrphans={pagedData().visibleOrphans}
          totalPages={totalPages()}
          currentPage={currentPage()}
          onPage={(p) => {
            setCurrentPage(p);
            const container = document.getElementById("ds-cache-view-container");
            if (container) container.scrollTop = 0;
          }}
          inputVal={inputVal}
          handleInput={handleInput}
          clearInput={() => {
            setInputVal("");
            setFilterText("");
            setCurrentPage(1);
          }}
          sortMode={sortMode}
          setSortMode={(v) => {
            setSortMode(v as DownloadedSortMode);
            setCurrentPage(1);
          }}
          totalChapters={totalChapters}
          totalBytes={totalBytes}
          purgeAll={purgeAll}
          purgePages={purgePages}
          purgeCovers={purgeCovers}
          wipeDb={wipeDb}
          backupDb={backupDb}
          restoreFromPicker={restoreFromPicker}
          deleteSeries={deleteSeries}
          deleteChapter={deleteChapter}
          deleteAllOrphans={deleteAllOrphans}
        />
      </Show>
    </div>
  );
}

function CacheBody(props: {
  stats: CacheData["stats"];
  dbStats: DbStats;
  totalWorks: number;
  traffic: () => SessionTraffic;
  hasRows: boolean;
  filteredRowsCount: number;
  visibleGroups: DownloadedSeriesGroup[];
  visibleOrphans: ProcessedCachedChapter[];
  totalPages: number;
  currentPage: number;
  onPage: (page: number) => void;
  inputVal: () => string;
  handleInput: (v: string) => void;
  clearInput: () => void;
  sortMode: () => DownloadedSortMode;
  setSortMode: (v: DownloadedSortMode) => void;
  totalChapters: () => number;
  totalBytes: () => number;
  purgeAll: () => Promise<void>;
  purgePages: () => Promise<void>;
  purgeCovers: () => Promise<void>;
  wipeDb: () => Promise<void>;
  backupDb: () => Promise<void>;
  restoreFromPicker: () => Promise<void>;
  deleteSeries: (group: DownloadedSeriesGroup) => Promise<void>;
  deleteChapter: (chapterPermalink: string) => Promise<void>;
  deleteAllOrphans: (orphans: ProcessedCachedChapter[]) => Promise<void>;
}) {
  return (
    <>
      <GroupBox title={<IconText icon={<ChartIcon />}>{t("cache.overviewTitle")}</IconText>}>
        <div class="ds-stats-grid ds-stats-grid--4">
          <StatCard value={formatBytes(props.stats.totalSizeBytes)} label={t("cache.diskFootprint")} />
          <StatCard value={props.stats.totalCachedPages} label={t("cache.pagesCached")} />
          <StatCard value={props.stats.totalCachedChapters} label={t("cache.chaptersCached")} />
          <StatCard value={props.totalWorks} label={t("cache.seriesCached")} />
        </div>
      </GroupBox>

      <GroupBox title={<IconText icon={<DatabaseIcon />}>{t("cache.dbStatsTitle")}</IconText>}>
        <div class="ds-stats-grid ds-stats-grid--4">
          <StatCard value={formatBytes(props.dbStats.file.totalSizeBytes)} label={t("cache.dbSizeTotal")} />
          <StatCard value={formatBytes(props.dbStats.file.dbSizeBytes)} label={t("cache.dbFile")} />
          <StatCard value={props.dbStats.totalRows} label={t("cache.totalRecords")} />
          <StatCard value={formatBytes(props.dbStats.file.walSizeBytes)} label={t("cache.walSize")} />
        </div>
        <div class="ds-db-details">
          <span>{t("cache.followedSeriesCount")} <strong>{props.dbStats.counts.followedSeries}</strong></span>
          <span>{t("cache.readingProgressCount")} <strong>{props.dbStats.counts.readingProgress}</strong></span>
          <span>{t("cache.historyCount")} <strong>{props.dbStats.counts.readingHistory}</strong></span>
          <span>{t("cache.bookmarksCount")} <strong>{props.dbStats.counts.bookmarks}</strong></span>
          <span>{t("cache.collectionsCount")} <strong>{props.dbStats.counts.collections}</strong> {t("cache.collectionItemsSuffix", { count: props.dbStats.counts.collectionItems })}</span>
          <span>{t("cache.cachedPagesCount")} <strong>{props.dbStats.counts.cachedPages}</strong></span>
          <span>{t("cache.cachedMetadataCount")} <strong>{props.dbStats.counts.cachedMetadata}</strong></span>
          <span>{t("cache.directoryEntriesCount")} <strong>{props.dbStats.counts.directoryEntries}</strong></span>
          <span>{t("cache.tagBlacklistCount")} <strong>{props.dbStats.counts.tagBlacklist}</strong></span>
          <span>{t("cache.seriesBlacklistCount")} <strong>{props.dbStats.counts.seriesBlacklist}</strong></span>
        </div>
        <div class="ds-cache-actions ds-cache-actions--mt">
          <IconButton icon={<DatabaseIcon />} text={t("cache.dbBackup")} title={t("cache.dbBackupTooltip")} onClick={() => void props.backupDb()} />
          <IconButton icon={<RefreshIcon />} text={t("cache.dbRestore")} title={t("cache.dbRestoreTooltip")} onClick={() => void props.restoreFromPicker()} />
          <ConfirmDeleteButton
            icon={<TrashIcon />}
            text={t("cache.dbWipe")}
            title={t("cache.dbWipeTooltip")}
            onConfirm={props.wipeDb}
          />
        </div>
      </GroupBox>
      <GroupBox title={<IconText icon={<TrafficIcon />}>{t("cache.trafficTitle")}</IconText>}>
        <div class="ds-stats-grid ds-stats-grid--4">
          <StatCard value={formatBytes(props.traffic().bytesDownloaded)} label={t("cache.sessionDownloaded", { count: props.traffic().networkRequests })} />
          <StatCard value={formatBytes(props.traffic().bytesSaved)} label={t("cache.sessionSaved", { count: props.traffic().cacheHits })} />
          <StatCard value={formatBytes(props.traffic().lifetime.bytesDownloaded)} label={t("cache.lifetimeDownloaded", { count: props.traffic().lifetime.networkRequests })} />
          <StatCard value={formatBytes(props.traffic().lifetime.bytesSaved)} label={t("cache.lifetimeSaved", { count: props.traffic().lifetime.cacheHits })} />
        </div>
        <div class="ds-cache-actions ds-cache-actions--mt">
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
      </GroupBox>
      <GroupBox title={<IconText icon={<ToolIcon />}>{t("cache.maintenanceTitle")}</IconText>}>
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
      </GroupBox>
      <GroupBox
        class="ds-flex-col"
        title={<IconText icon={<StorageIcon />}>{t("cache.cachedWorksTitle", { count: props.totalWorks })}</IconText>}
      >
        <Show
          when={!props.hasRows}
          fallback={
            <>
              <div id="ds-downloaded-header" class="ds-toolbar" style="margin-bottom:8px;">
                <div id="ds-downloaded-toolbar-left" class="ds-toolbar-row">
                  <InputField
                    id="ds-cache-search"
                    value={props.inputVal()}
                    onInput={props.handleInput}
                    placeholder={t("cache.filterPlaceholder")}
                    onClear={props.clearInput}
                  />
                  <div class="ds-downloaded-sort-wrap">
                    <span class="ds-item-meta ds-nowrap" style="font-size:11.5px;color:var(--sys-text-muted,#666);">
                      {t("cache.sortBy")}
                    </span>
                    <DsSelect
                      id="ds-cache-sort"
                      value={props.sortMode()}
                      onChange={(val) => props.setSortMode(val as DownloadedSortMode)}
                      options={[
                        { value: "size-desc", label: t("cache.sorts.sizeDesc") },
                        { value: "size-asc", label: t("cache.sorts.sizeAsc") },
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
                      {props.totalChapters()} ch
                      <Show when={props.totalChapters() > 0}>
                        {" "}({formatBytes(props.totalBytes())})
                      </Show>
                    </span>
                  </span>
                </div>
              </div>

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

              <Show when={props.filteredRowsCount === 0}>
                <EmptyState cssText="padding:16px;text-align:center;">
                  <span class="ds-muted">{t("cache.noMatchingWorks")}</span>
                </EmptyState>
              </Show>

              <Show when={props.visibleGroups.length > 0 || props.visibleOrphans.length > 0}>
                <div class="ds-feed-list">
                  <For each={props.visibleGroups}>
                    {(g) => (
                      <SeriesDownloadedCard
                        group={g}
                        defaultViewMode="list"
                        defaultCollapsed={true}
                        onDelete={() => void props.deleteSeries(g)}
                        onDeleteChapter={(cp) => void props.deleteChapter(cp)}
                      />
                    )}
                  </For>

                  {/* Orphan / Standalone Chapters */}
                  <Show when={props.visibleOrphans.length > 0}>
                    <OrphanDownloadedCard
                      orphans={props.visibleOrphans}
                      defaultCollapsed={true}
                      onDeleteAll={() => void props.deleteAllOrphans(props.visibleOrphans)}
                      onDeleteChapter={(cp) => void props.deleteChapter(cp)}
                    />
                  </Show>
                </div>
              </Show>

              <Show when={props.totalPages > 1}>
                <div id="ds-downloaded-pager" class="ds-pager-wrap" style="margin-top:8px;">
                  <Pager
                    totalPages={props.totalPages}
                    currentPage={props.currentPage}
                    onPage={props.onPage}
                    cssText="justify-content:flex-end;margin:0;"
                  />
                </div>
              </Show>
            </>
          }
        >
          <EmptyState cssText="padding:24px;text-align:center;">
            <span class="ds-muted">{t("cache.noCachedWorks")}</span>
          </EmptyState>
        </Show>
      </GroupBox>
    </>
  );
}