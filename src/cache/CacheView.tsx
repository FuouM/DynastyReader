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
  clearCachedGroupPages,
  getCacheOverviewStats,
  getCachedSeriesGroups,
  getDbStats,
  type CachedSeriesGroup,
  type DbStats,
} from "../db";
import { BackRefreshActions } from "../components/ActionBar";
import { EmptyState } from "../components/EmptyState";
import { GroupBox } from "../components/GroupBox";
import { HydratedCover } from "../components/HydratedCover";
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
  const { purgeAll, purgePages, purgeCovers, wipeDb, backupDb, restoreFromPicker } = useCacheActions(
    refetch as unknown as () => void,
  );



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
      <GroupBox title={<IconText icon={<ChartIcon />}>{t("cache.overviewTitle")}</IconText>}>
        <div class="ds-stats-grid ds-stats-grid--4">
          <StatCard value={formatBytes(stats.totalSizeBytes)} label={t("cache.diskFootprint")} />
          <StatCard value={stats.totalCachedPages} label={t("cache.pagesCached")} />
          <StatCard value={stats.totalCachedChapters} label={t("cache.chaptersCached")} />
          <StatCard value={groups.length} label={t("cache.seriesCached")} />
        </div>
      </GroupBox>

      <GroupBox title={<IconText icon={<DatabaseIcon />}>{t("cache.dbStatsTitle")}</IconText>}>
        <div class="ds-stats-grid ds-stats-grid--4">
          <StatCard value={formatBytes(dbStats.file.totalSizeBytes)} label={t("cache.dbSizeTotal")} />
          <StatCard value={formatBytes(dbStats.file.dbSizeBytes)} label={t("cache.dbFile")} />
          <StatCard value={dbStats.totalRows} label={t("cache.totalRecords")} />
          <StatCard value={formatBytes(dbStats.file.walSizeBytes)} label={t("cache.walSize")} />
        </div>
        <div class="ds-db-details">
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
          <StatCard value={formatBytes(traffic().bytesDownloaded)} label={t("cache.sessionDownloaded", { count: traffic().networkRequests })} />
          <StatCard value={formatBytes(traffic().bytesSaved)} label={t("cache.sessionSaved", { count: traffic().cacheHits })} />
          <StatCard value={formatBytes(traffic().lifetime.bytesDownloaded)} label={t("cache.lifetimeDownloaded", { count: traffic().lifetime.networkRequests })} />
          <StatCard value={formatBytes(traffic().lifetime.bytesSaved)} label={t("cache.lifetimeSaved", { count: traffic().lifetime.cacheHits })} />
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
        title={<IconText icon={<StorageIcon />}>{t("cache.cachedWorksTitle", { count: groups.length })}</IconText>}
      >

        <Show
          when={groups.length === 0}
          fallback={
            <>
              <div class="ds-cache-filter-bar">
                <InputField
                  placeholder={t("cache.filterPlaceholder")}
                  wrapperClass="ds-cache-input-flex"
                  value={props.filterText()}
                  onInput={(val) => props.setFilterText(val)}
                />
                <div class="ds-flex-row">
                  <span class="ds-item-meta ds-nowrap">
                    {t("cache.sortBy")}
                  </span>
                  <DsSelect
                    value={props.sortMode()}
                    onChange={(val) => props.setSortMode(val)}
                    options={[
                      { value: "size-desc", label: t("cache.sorts.sizeDesc") },
                      { value: "size-asc", label: t("cache.sorts.sizeAsc") },
                      { value: "date-desc", label: t("cache.sorts.dateDesc") },
                      { value: "date-asc", label: t("cache.sorts.dateAsc") },
                      { value: "pages-desc", label: t("cache.sorts.pagesDesc") },
                      { value: "name-asc", label: t("cache.sorts.nameAsc") },
                    ]}
                  />
                </div>
              </div>

              <div class="ds-cache-list ds-cache-list--auto">
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
                      <div class="ds-cache-item">
                        <HydratedCover
                          path={item.coverPath}
                          coverKey={item.seriesName}
                          size="cache"
                          onClick={() => props.openItem(item)}
                        />
                        <div class="ds-fill">
                          <div
                            class="ds-cache-item-title"
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
                          className="ds-btn-icon"
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
      </GroupBox>
    </>
  );
}