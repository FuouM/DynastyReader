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
  createSignal,
  onCleanup,
  Show,
  type Accessor,
} from "solid-js";
import {
  navigate,
  route,
  setActions,
  showBanner,
} from "../stores";
import { t } from "../i18n";
import {
  clearHistory,
  createCollection,
} from "../db";
import { ConfirmDeleteButton } from "../components/Button";
import { Modal } from "../components/Modal";
import {
  RefreshIcon,
  CheckIcon,
  StorageIcon,
  BlacklistIcon,
  BookmarkIcon,
  FolderIcon,
  AddIcon,
  TrashIcon,
  CloseIcon,
  Icon,
} from "../components/Icon";
import {
  FollowedPane,
  CollectionsPane,
  BookmarksPane,
  HistoryPane,
  type LibraryPaneApi,
} from "./panes";
import { CollectionDetailView } from "./CollectionDetailView";
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
  const [refreshing, setRefreshing] = createSignal(false);
  const [justUpdated, setJustUpdated] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  let updateTimer: number | null = null;

  onCleanup(() => {
    if (updateTimer !== null) window.clearTimeout(updateTimer);
  });

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
      if (updateTimer !== null) window.clearTimeout(updateTimer);
      updateTimer = window.setTimeout(() => {
        updateTimer = null;
        setJustUpdated(false);
      }, 1200);
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
      <LibraryActions
        refreshing={refreshing}
        justUpdated={justUpdated}
        onRefresh={() => void refreshAll()}
      />,
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
              <Icon name="bookmark-heart" /> {t("library.followed")}
            </span>
          </div>
          <div class="ds-library-panel-body">
            <FollowedPane register={register("followed")} />
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
              <FolderIcon /> {t("library.collections")}
            </span>
            <button
              type="button"
              class="win-button"
              style="font-size:10px;padding:0 5px;height:18px;line-height:18px;margin-left:auto;display:inline-flex;align-items:center;justify-content:center;gap:3px;"
              title="Create a new custom collection"
              onClick={() => setCreating(true)}
            >
              <AddIcon style={{ "font-size": "9px", "line-height": 1 }} />{" "}
              <span>New</span>
            </button>
          </div>
          <div class="ds-library-panel-body">
            <CollectionsPane
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
              <BookmarkIcon /> {t("library.bookmarks")}
            </span>
          </div>
          <div class="ds-library-panel-body">
            <BookmarksPane register={register("bookmarks")} />
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
              <Icon name="clock-history" /> {t("library.history")}
            </span>
            <ConfirmDeleteButton
              title="Clear all reading history"
              onConfirm={clearHistoryAll}
              cssText="font-size:10px;padding:0 6px;height:18px;display:inline-flex;align-items:center;justify-content:center;gap:3px;"
            >
              <TrashIcon style={{ "line-height": 1 }} /> Clear
            </ConfirmDeleteButton>
          </div>
          <div class="ds-library-panel-body">
            <HistoryPane register={register("history")} />
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
  let focusTimer: number | null = null;

  onCleanup(() => {
    if (focusTimer !== null) window.clearTimeout(focusTimer);
  });

  createEffect(() => {
    if (props.open()) {
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        focusTimer = null;
        inputEl?.focus();
      }, 50);
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
          <FolderIcon color="var(--sys-primary,#0078d4)" />{" "}
          {t("library.createCollectionModalTitle")}
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
              <CloseIcon />
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
            {t("common.cancel")}
          </button>
          <button
            type="button"
            class="win-button primary ds-modal-submit"
            style="font-size:11px;padding:2px 10px;display:inline-flex;align-items:center;gap:4px;"
            disabled={creating()}
            onClick={() => void submit()}
          >
            <AddIcon /> {t("library.createCollectionConfirm")}
          </button>
        </div>
      }
    />
  );
}

function LibraryActions(props: {
  refreshing: () => boolean;
  justUpdated: () => boolean;
  onRefresh: () => void;
}) {
  return (
    <>
      <button
        type="button"
        id="ds-library-refresh-btn"
        class="win-button ds-btn-sm"
        title="Refresh library from local database"
        disabled={props.refreshing() || props.justUpdated()}
        onClick={props.onRefresh}
      >
        <Show
          when={props.refreshing()}
          fallback={
            <Show
              when={props.justUpdated()}
              fallback={
                <>
                  <RefreshIcon /> <span class="ds-btn-text">Refresh Library</span>
                </>
              }
            >
              <CheckIcon /> <span class="ds-btn-text">Updated</span>
            </Show>
          }
        >
          <RefreshIcon spin={true} /> <span class="ds-btn-text">Refreshing...</span>
        </Show>
      </button>
      <button
        type="button"
        class="win-button ds-btn-compact"
        title="View cache storage statistics and manage cached series/pages"
        onClick={() => navigate({ view: "cache" })}
      >
        <StorageIcon /> <span class="ds-btn-text">Cache Management</span>
      </button>
      <button
        type="button"
        class="win-button ds-btn-compact"
        title="Manage blacklisted series and view hidden works"
        onClick={() => navigate({ view: "blacklist" })}
      >
        <BlacklistIcon /> <span class="ds-btn-text">Series Blacklist</span>
      </button>
    </>
  );
}
