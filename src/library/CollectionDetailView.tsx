/**
 * Collection detail view: lists items in a collection with filtering,
 * lazy cover hydration, external site links, and deletion.
 */

import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  decodeEntities,
  formatDate,
  navigate,
  setActions,
  setTitle,
  showBanner,
  seriesTypeToPath,
} from "../stores";
import { t } from "../i18n";
import { getOrHydrateItemCover, getOrHydrateSeriesCover } from "../api";
import {
  getCollectionById,
  getCollectionItems,
  getCollectionsRevision,
  onCollectionsChanged,
  removeItemFromCollection,
  updateCollectionItemCover,
  type CollectionItemRow,
  type CollectionRow,
} from "../db";
import { useDelayedSpinner } from "../browse/browse-state";
import { Loading } from "../components/Loading";
import {
  FolderIcon,
  StarIcon,
  CloseIcon,
  ArrowLeftIcon,
  RefreshIcon,
} from "../components/Icon";
import { TopbarAction } from "../components/ActionBar";
import { LibraryItemRow } from "./LibraryItemRow";

export interface CollectionDetailViewProps {
  collectionId: number;
}

export function CollectionDetailView(props: CollectionDetailViewProps) {
  const [tick, setTick] = createSignal(0);
  const [rev, setRev] = createSignal(getCollectionsRevision());
  onMount(() => {
    const unsub = onCollectionsChanged(() => setRev(getCollectionsRevision()));
    onCleanup(unsub);
  });

  const [filter, setFilter] = createSignal("");
  const [data] = createResource(
    () => ({ id: props.collectionId, tick: tick(), rev: rev() }),
    async ({ id }) => {
      const [collection, items] = await Promise.all([
        getCollectionById(id),
        getCollectionItems(id),
      ]);
      return { collection, items };
    },
  );
  const showSpinner = useDelayedSpinner(() => data.loading);
  createEffect(() => {
    setActions(
      <>
        <TopbarAction
          title={t("library.backToLibrary")}
          onClick={() => navigate({ view: "library" })}
        >
          <ArrowLeftIcon /> {t("library.backToLibrary")}
        </TopbarAction>
        <TopbarAction title={t("common.refresh")} onClick={() => setTick((t) => t + 1)}>
          <RefreshIcon /> {t("common.refresh")}
        </TopbarAction>
      </>,
    );
  });

  // Title follows the collection name once loaded.
  createEffect(() => {
    const c = data()?.collection;
    if (c) setTitle(c.name);
  });

  // Collection missing -> back to the main library grid.
  createEffect(() => {
    if (data() && data()!.collection === null) {
      showBanner(t("library.collectionNotFoundBanner"));
      navigate({ view: "library" });
    }
  });

  const collection = (): CollectionRow | null => data()?.collection ?? null;
  const totalItems = (): number => data()?.items.length ?? 0;

  const filteredItems = createMemo<CollectionItemRow[]>(() => {
    const m = data();
    if (!m) return [];
    const q = filter().trim().toLowerCase();
    if (!q) return m.items;
    return m.items.filter(
      (it) =>
        it.item_title.toLowerCase().includes(q) ||
        (it.parent_series_name !== null && it.parent_series_name.toLowerCase().includes(q)) ||
        it.item_permalink.toLowerCase().includes(q),
    );
  });

  return (
    <div id="ds-collection-detail-container">
      <Show
        when={data() !== undefined}
        fallback={
          <Show when={showSpinner()}>
            <Loading />
          </Show>
        }
      >
        <div class="ds-collection-header-bar">
          <div class="ds-collection-stats">
            <Show
              when={collection()?.is_default}
              fallback={<FolderIcon color="var(--sys-primary,#0078d4)" style={{ "font-size": "13px" }} />}
            >
              <StarIcon filled={true} style={{ color: "#d97706", "font-size": "13px" }} />
            </Show>
            <span>
              <b>{decodeEntities(collection()?.name ?? "")}</b> — <b>{totalItems()}</b> {totalItems() === 1 ? t("library.nounItem") : t("library.nounItems")}
            </span>
          </div>
          <div class="input-wrapper" style="width:220px;max-width:100%;">
            <input
              type="text"
              placeholder={t("library.filterCollectionPlaceholder")}
              style="width:100%;box-sizing:border-box;font-size:11px;height:22px;"
              value={filter()}
              onInput={(ev) => setFilter((ev.target as HTMLInputElement).value)}
            />
            <button
              type="button"
              class="input-clear-btn"
              tabIndex={-1}
              title={t("common.clear")}
              onClick={() => setFilter("")}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow-y:auto;">
          <Show when={totalItems() === 0}>
            <div class="ds-muted" style="padding:16px 8px;font-size:11px;">
              {t("library.emptyCollectionNotice")}
            </div>
          </Show>
          <Show when={totalItems() > 0 && filteredItems().length === 0}>
            <div class="ds-muted" style="padding:16px 8px;text-align:center;font-size:11px;">
              {t("library.noMatchingCollectionItems", { query: filter() })}
            </div>
          </Show>
          <Show when={filteredItems().length > 0}>
            <div class="ds-feed-list" style="display:flex;flex-direction:column;gap:4px;">
              <For each={filteredItems()}>
                {(it) => (
                  <CollectionItemCard
                    it={it}
                    collectionId={props.collectionId}
                    onChanged={() => setTick((t) => t + 1)}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function CollectionItemCard(props: {
  it: CollectionItemRow;
  collectionId: number;
  onChanged: () => void;
}) {
  const isChapterLike =
    props.it.item_kind === "chapter" ||
    props.it.item_kind === "oneshot" ||
    props.it.item_kind === "doujin";

  const [cover, setCover] = createSignal(props.it.cover);

  // Lazy cover hydration when no local file path is cached yet.
  createEffect(() => {
    const c = props.it.cover;
    if (c && (c.includes("/") || c.includes("\\"))) return;
    const task =
      !isChapterLike && props.it.item_kind === "series"
        ? getOrHydrateSeriesCover(props.it.item_permalink)
        : getOrHydrateItemCover(
            props.it.cover || `chapter:${props.it.item_permalink}`,
            props.it.item_permalink,
            props.it.parent_series_permalink,
            props.it.item_kind,
          );
    void task.then((freshPath) => {
      if (freshPath) {
        setCover(freshPath);
        void updateCollectionItemCover(props.it.id, freshPath);
      }
    });
  });

  const onOpen = (): void => {
    if (isChapterLike) {
      navigate({
        view: "reader",
        chapterPermalink: props.it.item_permalink,
        chapterTitle: props.it.item_title,
        seriesPermalink: props.it.parent_series_permalink || undefined,
        seriesName: props.it.parent_series_name || undefined,
      });
    } else {
      navigate({
        view: "series",
        seriesPermalink: props.it.item_permalink,
        seriesName: props.it.item_title,
      });
    }
  };

  const kindLabel =
    props.it.item_kind === "oneshot"
      ? t("library.kinds.oneshot")
      : props.it.item_kind === "chapter"
        ? t("library.kinds.chapter")
        : props.it.item_kind === "doujin"
          ? t("library.kinds.doujin")
          : props.it.item_kind === "anthology"
            ? t("library.kinds.anthology")
            : t("library.kinds.series");

  const endpoint = isChapterLike ? "chapters" : seriesTypeToPath(props.it.item_kind);

  return (
    <LibraryItemRow
      title={props.it.item_title}
      subtitle={
        props.it.parent_series_name
          ? `${decodeEntities(props.it.parent_series_name)} · ${t("library.addedOn", { date: formatDate(Number(props.it.created_at)) })}`
          : t("library.addedOn", { date: formatDate(Number(props.it.created_at)) })
      }
      badge={kindLabel}
      cover={cover()}
      coverAlt={props.it.item_title}
      onOpen={onOpen}
      actionLabel={isChapterLike ? t("common.read") : t("common.open")}
      actionIcon={isChapterLike ? "bi-book" : "bi-folder2-open"}
      externalUrl={`https://dynasty-scans.com/${endpoint}/${props.it.item_permalink}`}
      deleteTitle={t("library.removeFromCollectionTooltip")}
      onDelete={async () => {
        await removeItemFromCollection(props.collectionId, props.it.item_permalink);
        showBanner(t("library.removedFromCollectionBanner", { title: props.it.item_title }));
        props.onChanged();
      }}
    />
  );
}
