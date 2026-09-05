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
import { navigate, setSessionTab } from "../stores/router";
import { setActions, showBanner } from "../stores/topbar";
import { downloadingChapterPermalinks } from "../stores/download";
import { formatBytes } from "../utils/formatting";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
import { getSessionTraffic, subscribeSessionTraffic, resetLifetimeTraffic, type SessionTraffic } from "../api/traffic";
import { clearCachedGroupPages, getCacheOverviewStats, getFullyCachedChapters, pruneOldestReadCachedPages, type FullyCachedChapterRow } from "../db/cache.repo";
import { getBookmarkPermalinks, getHistoryMap } from "../db/library.repo";
import { getBatchCached } from "../db/metadata.repo";
import { getDbStats, type DbStats } from "../db/db.manage";
import type { CacheOverviewStats } from "../types/db";
import { SeriesDownloadedCard } from "../browse/downloaded/SeriesDownloadedCard";
import { OrphanDownloadedCard } from "../browse/downloaded/OrphanDownloadedCard";
import { DownloadedLegend } from "../browse/downloaded/DownloadedLegend";
import { DownloadedToolbar } from "../browse/downloaded/DownloadedToolbar";
import { buildGroups } from "../browse/downloaded/buildGroups";
import type {
  DownloadedSortMode,
  DownloadedSeriesGroup,
  ProcessedCachedChapter,
} from "../browse/downloaded/types";
import { isVolumeOrSectionHeader } from "../utils/volume";
import { Pager } from "../components/Pager";
import { BackRefreshActions } from "../components/ActionBar";
import { EmptyState } from "../components/EmptyState";
import { GroupBox } from "../components/GroupBox";
import { ConfirmDeleteButton, IconText, IconButton, StatCard, DsSelect, DsSwitch } from "../components/Button";
import { useCacheActions } from "./useCacheActions";
import {
  CACHE_CEILING_OPTIONS,
  cacheCeilingBytes,
  setCacheCeilingBytes,
  cacheAutoPruneEnabled,
  setCacheAutoPruneEnabled,
} from "../utils/cache-quota";
import { Loading } from "../components/Loading";
import { ErrorRetryRow } from "../components/ErrorRetryRow";
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

  // Chapters with an in-flight download must not be purged: the queue keeps
  // writing pages after the deletion query, leaving stale DB rows (D-M3).
  const isChapterDownloading = (cp: string): boolean => downloadingChapterPermalinks().has(cp);

  const deleteSeries = async (group: DownloadedSeriesGroup): Promise<void> => {
    const perms = group.chapters
      .map((c) => c.chapterPermalink)
      .filter((cp) => !isChapterDownloading(cp));
    if (perms.length === 0) return;
    await clearCachedGroupPages(perms);
    setSessionTab((cur) => {
      if (!cur) return null;
      const sPerm = cur.route.seriesPermalink;
      const chPerm = cur.route.chapterPermalink;
      if (sPerm === group.seriesPermalink || (chPerm && perms.includes(chPerm))) {
        return null;
      }
      return cur;
    });
    showBanner(t("cache.deletedWorkSuccess", { name: group.seriesName || group.seriesPermalink }));
    void refetch();
  };

  const deleteChapter = async (chapterPermalink: string): Promise<void> => {
    if (isChapterDownloading(chapterPermalink)) return;
    await clearCachedGroupPages([chapterPermalink]);
    setSessionTab((cur) => {
      if (!cur) return null;
      if (cur.route.chapterPermalink === chapterPermalink) {
        return null;
      }
      return cur;
    });
    showBanner(t("cache.chapterClearedBanner"));
    void refetch();
  };

  const deleteAllOrphans = async (orphans: ProcessedCachedChapter[]): Promise<void> => {
    const perms = orphans.map((o) => o.chapterPermalink).filter((cp) => !isChapterDownloading(cp));
    if (perms.length === 0) return;
    await clearCachedGroupPages(perms);
    setSessionTab((cur) => {
      if (!cur) return null;
      if (cur.route.chapterPermalink && perms.includes(cur.route.chapterPermalink)) {
        return null;
      }
      return cur;
    });
    showBanner(t("cache.orphansClearedBanner"));
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
        <ErrorRetryRow
          message={t("cache.statsLoadError", { msg: errorMessage(data.error) })}
          onRetry={() => void refetch()}
        />
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
          isChapterDownloading={isChapterDownloading}
          onPruned={() => void refetch()}
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
  isChapterDownloading: (chapterPermalink: string) => boolean;
  onPruned: () => void;
}) {
  const [pruning, setPruning] = createSignal(false);

  const ceilingUsage = (): string => {
    const ceiling = cacheCeilingBytes();
    const used = formatBytes(props.stats.totalSizeBytes);
    return ceiling > 0
      ? t("cache.ceilingUsageLimited", { used, ceiling: formatBytes(ceiling) })
      : t("cache.ceilingUsageUnlimited", { used });
  };

  const handlePruneNow = async () => {
    const ceiling = cacheCeilingBytes();
    if (ceiling <= 0 || pruning()) return;
    setPruning(true);
    try {
      const res = await pruneOldestReadCachedPages(ceiling, downloadingChapterPermalinks());
      showBanner(
        res.prunedChapters > 0
          ? t("cache.pruneDone", { count: res.prunedChapters, freed: formatBytes(res.freedBytes) })
          : t("cache.pruneNoop"),
      );
      props.onPruned();
    } catch (err) {
      showBanner(errorMessage(err));
    } finally {
      setPruning(false);
    }
  };

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

      <GroupBox title={<IconText icon={<StorageIcon />}>{t("cache.ceilingTitle")}</IconText>}>
        <div class="ds-col" style="gap:8px;">
          <div class="ds-cache-actions" style="align-items:center;">
            <span class="ds-muted">{t("cache.ceilingLabel")}</span>
            <DsSelect
              id="ds-cache-ceiling-select"
              value={String(cacheCeilingBytes())}
              options={CACHE_CEILING_OPTIONS.map((o) => ({
                value: String(o.value),
                label: t(o.labelKey),
              }))}
              onChange={(v) => setCacheCeilingBytes(Number(v) || 0)}
            />
          </div>
          <div class="ds-muted">{ceilingUsage()}</div>
          <div class="ds-cache-actions" style="align-items:center;">
            <DsSwitch
              id="ds-cache-auto-prune"
              checked={cacheAutoPruneEnabled()}
              disabled={cacheCeilingBytes() <= 0}
              title={t("cache.autoPruneTooltip")}
              onChange={(next) => setCacheAutoPruneEnabled(next)}
            />
            <span class="ds-muted">{t("cache.autoPruneLabel")}</span>
            <IconButton
              icon={<RefreshIcon />}
              text={pruning() ? t("cache.pruneRunning") : t("cache.pruneNow")}
              title={t("cache.pruneNowTooltip")}
              disabled={cacheCeilingBytes() <= 0 || pruning()}
              onClick={() => void handlePruneNow()}
            />
          </div>
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
              <DownloadedToolbar
                inputId="ds-cache-search"
                inputVal={props.inputVal()}
                onInput={props.handleInput}
                inputPlaceholder={t("cache.filterPlaceholder")}
                onClear={props.clearInput}
                sortId="ds-cache-sort"
                sortValue={props.sortMode()}
                onSortChange={(val) => props.setSortMode(val)}
                sortOptions={[
                  { value: "size-desc", label: t("cache.sorts.sizeDesc") },
                  { value: "size-asc", label: t("cache.sorts.sizeAsc") },
                  { value: "download-desc", label: t("browse.downloaded.sorts.lastDownloaded") },
                  { value: "name-asc", label: t("browse.downloaded.sorts.alphabetical") },
                  { value: "read-desc", label: t("browse.downloaded.sorts.lastRead") },
                ]}
                totalChapters={props.totalChapters()}
                totalBytes={props.totalBytes()}
                countLabel={t("cache.sortBy")}
                cssText="margin-bottom:8px;"
              />

              {/* Legend */}
              <DownloadedLegend />

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
                        isChapterDeleteDisabled={props.isChapterDownloading}
                        hideDelete={() => g.chapters.some((c) => props.isChapterDownloading(c.chapterPermalink))}
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
                      isChapterDeleteDisabled={props.isChapterDownloading}
                      hideDeleteAll={() => props.visibleOrphans.some((o) => props.isChapterDownloading(o.chapterPermalink))}
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