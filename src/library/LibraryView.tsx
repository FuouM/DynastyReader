/**
 * Solid Library view. Port of `ui-library.ts`:
 *
 *  - the four-panel grid (Followed / Collections / Bookmarks / History)
 *  - top-bar actions (Refresh Library + Cache Management + Series Blacklist)
 *  - the collection-detail route driven by `route().collectionId`
 *  - the create-collection modal and two-click confirm-deletes
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
  type Accessor,
} from "solid-js";
import {
  decodeEntities,
  formatDate,
  navigate,
  route,
  setActions,
  setTitle,
  showBanner,
} from "../stores";
import { getOrHydrateItemCover, getOrHydrateSeriesCover, openExternal } from "../api";
import {
  clearHistory,
  createCollection,
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
import { Cover } from "../components/Cover";
import { ConfirmDeleteButton } from "../components/Button";
import { Loading } from "../components/Loading";
import { Modal } from "../components/Modal";
import { TopbarAction } from "../components/ActionBar";
import {
  FollowedPane,
  CollectionsPane,
  BookmarksPane,
  HistoryPane,
  type LibraryPaneApi,
} from "./panes";

export function LibraryView() {
  return (
    <Show
      when={route().collectionId === undefined}
      fallback={<CollectionDetailView collectionId={route().collectionId!} />}
    >
      <LibraryGrid />
    </Show>
  );
}

// ---------------------------------------------------------------------------
// Main grid
// ---------------------------------------------------------------------------

function LibraryGrid() {
  const [tick] = createSignal(0);
  const [refreshing, setRefreshing] = createSignal(false);
  const [justUpdated, setJustUpdated] = createSignal(false);
  const [creating, setCreating] = createSignal(false);

  const paneApis: Record<string, LibraryPaneApi> = {};
  const register = (key: string) => (api: LibraryPaneApi) => {
    paneApis[key] = api;
  };

  const refreshAll = async (): Promise<void> => {
    setRefreshing(true);
    try {
      const apis = Object.values(paneApis);
      for (const api of apis) api.reset();
      await Promise.all(apis.map((api) => api.refetch()));
      setJustUpdated(true);
      window.setTimeout(() => setJustUpdated(false), 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showBanner(`Library refresh failed: ${msg}`);
    } finally {
      setRefreshing(false);
    }
  };

  const openDetail = (id: number): void => {
    navigate({ view: "library", collectionId: id });
  };

  // Publish the grid's top-bar actions whenever the Library grid is active.
  createEffect(() => {
    const r = route();
    if (r.view !== "library" || r.collectionId !== undefined) return;
    setActions(
      <>
        <button
          type="button"
          id="ds-library-refresh-btn"
          class="win-button ds-btn-sm"
          title="Refresh library from local database"
          disabled={refreshing() || justUpdated()}
          onClick={() => void refreshAll()}
        >
          {refreshing() ? (
            <>
              <i class="bi bi-arrow-clockwise ds-spin"></i> Refreshing...
            </>
          ) : justUpdated() ? (
            <>
              <i class="bi bi-check2"></i> Updated
            </>
          ) : (
            <>
              <i class="bi bi-arrow-clockwise"></i> Refresh Library
            </>
          )}
        </button>
        <TopbarAction
          title="View cache storage statistics and manage cached series/pages"
          onClick={() => navigate({ view: "cache" })}
        >
          <i class="bi bi-hdd-stack"></i> Cache Management
        </TopbarAction>
        <TopbarAction
          title="Manage blacklisted series and view hidden works"
          onClick={() => navigate({ view: "blacklist" })}
        >
          <i class="bi bi-shield-slash"></i> Series Blacklist
        </TopbarAction>
      </>
    );
  });

  const clearHistoryAll = async (): Promise<void> => {
    await clearHistory();
    showBanner("All reading history cleared.");
    paneApis.history?.reset();
    await paneApis.history?.refetch();
  };

  return (
    <div id="ds-library-container">
      <div class="ds-library-grid">
        {/* 1. Followed Series */}
        <div class="group-box ds-library-panel">
          <div class="group-box-title">
            <span>
              <i class="bi bi-bookmark-heart"></i> Followed Series
            </span>
          </div>
          <div class="ds-library-panel-body">
            <FollowedPane tick={tick} register={register("followed")} />
          </div>
          <div class="ds-library-panel-footer ds-hidden"></div>
        </div>

        {/* 2. Collections & Favorites */}
        <div class="group-box ds-library-panel">
          <div
            class="group-box-title"
            style="display:flex;align-items:center;justify-content:space-between;width:calc(100% - 16px);right:8px;"
          >
            <span>
              <i class="bi bi-folder-fill"></i> Collections
            </span>
            <button
              type="button"
              class="win-button"
              style="font-size:10px;padding:0 5px;height:18px;line-height:18px;margin-left:auto;display:inline-flex;align-items:center;justify-content:center;gap:3px;"
              title="Create a new custom collection"
              onClick={() => setCreating(true)}
            >
              <i class="bi bi-plus-lg" style="font-size:9px;line-height:1;"></i>{" "}
              <span>New</span>
            </button>
          </div>
          <div class="ds-library-panel-body">
            <CollectionsPane
              tick={tick}
              register={register("collections")}
              onOpenDetail={openDetail}
              onCreateNew={() => setCreating(true)}
            />
          </div>
          <div class="ds-library-panel-footer ds-hidden"></div>
        </div>

        {/* 3. Bookmarks */}
        <div class="group-box ds-library-panel">
          <div class="group-box-title">
            <span>
              <i class="bi bi-bookmark"></i> Bookmarks
            </span>
          </div>
          <div class="ds-library-panel-body">
            <BookmarksPane tick={tick} register={register("bookmarks")} />
          </div>
          <div class="ds-library-panel-footer ds-hidden"></div>
        </div>

        {/* 4. Reading History */}
        <div class="group-box ds-library-panel">
          <div
            class="group-box-title"
            style="display:flex;align-items:center;justify-content:space-between;width:calc(100% - 16px);right:8px;"
          >
            <span>
              <i class="bi bi-clock-history"></i> Reading History
            </span>
            <ConfirmDeleteButton
              title="Clear all reading history"
              onConfirm={clearHistoryAll}
              cssText="font-size:10px;padding:0 6px;height:18px;display:inline-flex;align-items:center;justify-content:center;gap:3px;"
            >
              <i class="bi bi-trash3" style="line-height:1;"></i> Clear
            </ConfirmDeleteButton>
          </div>
          <div class="ds-library-panel-body">
            <HistoryPane tick={tick} register={register("history")} />
          </div>
          <div class="ds-library-panel-footer ds-hidden"></div>
        </div>
      </div>

      <CreateCollectionModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          paneApis.collections?.reset();
          void paneApis.collections?.refetch();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create-collection dialog
// ---------------------------------------------------------------------------

function CreateCollectionModal(props: {
  open: Accessor<boolean>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  let inputEl: HTMLInputElement | undefined;

  createEffect(() => {
    if (props.open()) {
      window.setTimeout(() => inputEl?.focus(), 50);
    } else {
      setName("");
      setCreating(false);
    }
  });

  const submit = async (): Promise<void> => {
    const n = name().trim();
    if (!n) return;
    setCreating(true);
    try {
      await createCollection(n);
      showBanner(`Created collection "${n}".`);
      props.onClose();
      props.onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showBanner(`Failed to create collection: ${msg}`);
      setCreating(false);
    }
  };

  return (
    <Modal
      open={props.open()}
      backdropId="ds-create-collection-overlay"
      width={320}
      onClose={props.onClose}
      title={
        <>
          <i class="bi bi-folder-plus" style="color:var(--sys-primary,#0078d4);"></i>{" "}
          New Collection
        </>
      }
      body={
        <div style="padding:10px 12px 8px;display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:11px;font-weight:600;color:var(--sys-window-text,#111);">
            Collection Name:
          </label>
          <div class="input-wrapper" style="width:100%;">
            <input
              ref={inputEl}
              type="text"
              class="input-field has-clear"
              placeholder="e.g. Yuri Gems, Read Later..."
              style="width:100%;box-sizing:border-box;font-size:11px;height:24px;"
              value={name()}
              onInput={(ev) => setName((ev.target as HTMLInputElement).value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") void submit();
              }}
            />
            <button
              type="button"
              class="input-clear-btn"
              tabIndex={-1}
              title="Clear"
              onClick={() => setName("")}
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </div>
      }
      footer={
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;width:100%;">
          <button
            type="button"
            class="win-button ds-modal-cancel"
            style="font-size:11px;padding:2px 10px;"
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            class="win-button primary ds-modal-submit"
            style="font-size:11px;padding:2px 10px;display:inline-flex;align-items:center;gap:4px;"
            disabled={creating()}
            onClick={() => void submit()}
          >
            <i class="bi bi-plus-lg" style="font-size:10px;line-height:1;"></i>{" "}
            <span>Create</span>
          </button>
        </div>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Collection detail
// ---------------------------------------------------------------------------

function CollectionDetailView(props: { collectionId: number }) {
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

  // Publish the detail view's top-bar actions whenever it is active.
  createEffect(() => {
    const r = route();
    if (r.view !== "library" || r.collectionId !== props.collectionId) return;
    setActions(
      <>
        <TopbarAction
          title="Back"
          onClick={() => navigate({ view: "library" })}
        >
          <i class="bi bi-arrow-left"></i> Back to Collections
        </TopbarAction>
        <TopbarAction title="Refresh" onClick={() => setTick((t) => t + 1)}>
          <i class="bi bi-arrow-clockwise"></i> Refresh
        </TopbarAction>
      </>
    );
  });

  // Title follows the collection name once loaded.
  createEffect(() => {
    const c = data()?.collection;
    if (c) setTitle(c.name);
  });

  // Collection missing → back to the main library grid.
  createEffect(() => {
    if (data() && data()!.collection === null) {
      showBanner("Collection not found.");
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
            <i
              class={collection()?.is_default ? "bi bi-star-fill" : "bi bi-folder2-open"}
              style={
                collection()?.is_default
                  ? "color:#d97706;font-size:13px;"
                  : "color:var(--sys-primary,#0078d4);font-size:13px;"
              }
            ></i>
            <span>
              <b>{decodeEntities(collection()?.name ?? "")}</b> — <b>{totalItems()}</b> item
              {totalItems() === 1 ? "" : "s"}
            </span>
          </div>
          <div class="input-wrapper" style="width:220px;max-width:100%;">
            <input
              type="text"
              class="input-field has-clear"
              placeholder="Filter items in collection..."
              style="width:100%;box-sizing:border-box;font-size:11px;height:22px;"
              value={filter()}
              onInput={(ev) => setFilter((ev.target as HTMLInputElement).value)}
            />
            <button
              type="button"
              class="input-clear-btn"
              tabIndex={-1}
              title="Clear"
              onClick={() => setFilter("")}
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow-y:auto;">
          <Show when={totalItems() === 0}>
            <div class="ds-muted" style="padding:16px 8px;font-size:11px;">
              No items in this collection yet. Click{" "}
              <b>
                <i class="bi bi-folder-plus"></i> Add to...
              </b>{" "}
              on any series or chapter in Browse / Search / Series pages to add items here.
            </div>
          </Show>
          <Show when={totalItems() > 0 && filteredItems().length === 0}>
            <div class="ds-muted" style="padding:16px 8px;text-align:center;font-size:11px;">
              {`No items matched "${filter()}".`}
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
      ? "One-shot"
      : props.it.item_kind === "chapter"
        ? "Chapter"
        : props.it.item_kind === "doujin"
          ? "Doujin"
          : props.it.item_kind === "anthology"
            ? "Anthology"
            : "Series";

  const endpoint =
    isChapterLike
      ? "chapters"
      : props.it.item_kind === "doujin"
        ? "doujins"
        : props.it.item_kind === "anthology"
          ? "anthologies"
          : "series";

  return (
    <div
      class="ds-item ds-flex-row ds-clickable"
      style="padding:5px 8px;border-radius:2px;gap:8px;cursor:pointer;"
      onClick={onOpen}
    >
      <div style="flex-shrink:0;cursor:pointer;">
        <Cover
          path={cover()}
          alt={props.it.item_title}
          imgClass="ds-collection-cover"
          placeholderClass="ds-collection-cover-placeholder"
        />
      </div>

      <div class="ds-fill">
        <div class="ds-flex-row" style="align-items:center;gap:6px;flex-wrap:wrap;">
          <span class="ds-item-title" style="font-weight:600;font-size:12px;">
            {decodeEntities(props.it.item_title)}
          </span>
          <span
            class="ds-muted"
            style="font-size:10px;background:var(--sys-control-bg,#eaeaea);padding:1px 5px;border-radius:2px;text-transform:capitalize;"
          >
            {kindLabel}
          </span>
        </div>
        <div class="ds-item-meta">
          {props.it.parent_series_name
            ? `${decodeEntities(props.it.parent_series_name)} · Added on ${formatDate(Number(props.it.created_at))}`
            : `Added on ${formatDate(Number(props.it.created_at))}`}
        </div>
      </div>

      <button
        type="button"
        class="win-button ds-btn-sm"
        style="font-size:10px;padding:2px 8px;flex-shrink:0;"
        onClick={(ev) => {
          ev.stopPropagation();
          onOpen();
        }}
      >
        {isChapterLike ? (
          <>
            <i class="bi bi-book"></i> Read
          </>
        ) : (
          <>
            <i class="bi bi-folder2-open"></i> Open
          </>
        )}
      </button>

      <button
        type="button"
        class="win-button"
        style="font-size:10px;padding:2px 6px;flex-shrink:0;"
        title="Open on Dynasty Scans in browser"
        onClick={(ev) => {
          ev.stopPropagation();
          openExternal(`https://dynasty-scans.com/${endpoint}/${props.it.item_permalink}`);
        }}
      >
        <i class="bi bi-box-arrow-up-right"></i>
      </button>

      <ConfirmDeleteButton
        title="Remove from collection"
        onConfirm={async () => {
          await removeItemFromCollection(props.collectionId, props.it.item_permalink);
          showBanner(`Removed "${props.it.item_title}" from collection.`);
          props.onChanged();
        }}
        cssText="font-size:10px;padding:2px 6px;"
      >
        <i class="bi bi-trash3"></i>
      </ConfirmDeleteButton>
    </div>
  );
}