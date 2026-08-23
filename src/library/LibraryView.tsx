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
  For,
  Show,
  type Accessor,
} from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import {
  navigate,
  route,
  setActions,
  setRoute,
  showBanner,
  isMobile,
} from "../stores";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
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
// Main grid & Tabbed view
// ---------------------------------------------------------------------------

export type LibraryTabId = "followed" | "collections" | "bookmarks" | "history";

export interface LibraryTabDef {
  id: LibraryTabId;
  label: string;
  shortLabel?: string;
  icon: string;
}

export const getLibraryTabs = (): readonly LibraryTabDef[] => [
  {
    id: "followed",
    get label() { return t("library.tabs.followed"); },
    get shortLabel() { return t("library.tabsShort.followed"); },
    icon: "bi-bookmark-heart",
  },
  {
    id: "collections",
    get label() { return t("library.tabs.collections"); },
    get shortLabel() { return t("library.tabsShort.collections"); },
    icon: "bi-folder2-open",
  },
  {
    id: "bookmarks",
    get label() { return t("library.tabs.bookmarks"); },
    get shortLabel() { return t("library.tabsShort.bookmarks"); },
    icon: "bi-bookmark",
  },
  {
    id: "history",
    get label() { return t("library.tabs.history"); },
    get shortLabel() { return t("library.tabsShort.history"); },
    icon: "bi-clock-history",
  },
];

function LibraryGrid() {
  const [refreshing, setRefreshing] = createSignal(false);
  const [justUpdated, setJustUpdated] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  const [isNarrow, setIsNarrow] = createSignal(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 680px)").matches : false,
  );

  if (typeof window !== "undefined") {
    const mq = window.matchMedia("(max-width: 680px)");
    makeEventListener(mq, "change", (e) => setIsNarrow(e.matches));
  }

  const isNarrowOrMobile = () => isNarrow() || isMobile();

  const activeTab = (): LibraryTabId => (route().libraryTab ?? "followed") as LibraryTabId;

  const switchTab = (tabId: LibraryTabId): void => {
    setRoute((r) => ({ ...r, libraryTab: tabId }));
  };

  let updateTimer: number | null = null;
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
      const msg = errorMessage(err);
      showBanner(t("library.refreshErrorBanner", { msg }));
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
    showBanner(t("library.historyClearedBanner"));
    paneApis.history?.reset();
    await paneApis.history?.refetch();
  };

  return (
    <div id="ds-library-container">
      <Show
        when={isNarrowOrMobile()}
        fallback={
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
                  title={t("library.createCollectionTooltip")}
                  onClick={() => setCreating(true)}
                >
                  <AddIcon style={{ "font-size": "9px", "line-height": 1 }} />{" "}
                  <span>{t("library.newCollectionButton")}</span>
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
                  class="win-button"
                  title={t("library.clearHistoryTooltip")}
                  onConfirm={clearHistoryAll}
                  cssText="font-size:10px;padding:0 5px;height:18px;line-height:18px;margin-left:auto;display:inline-flex;align-items:center;justify-content:center;gap:3px;"
                >
                  <TrashIcon style={{ "font-size": "9px", "line-height": 1 }} /> {t("library.clearHistoryButton")}
                </ConfirmDeleteButton>
              </div>
              <div class="ds-library-panel-body">
                <HistoryPane register={register("history")} />
              </div>
              <div class="ds-library-panel-footer ds-hidden"></div>
            </div>
          </div>
        }
      >
        {/* Narrow / Mobile 4-tab Layout */}
        <div class="ds-subtabs">
          <div class="ds-subtabs-left">
            <For each={getLibraryTabs()}>
              {(tab) => (
                <button
                  type="button"
                  class="win-button ds-subtab"
                  classList={{ active: activeTab() === tab.id }}
                  data-tab-id={tab.id}
                  title={tab.label}
                  onClick={() => switchTab(tab.id)}
                >
                  <i class={`bi ${tab.icon}`} style="margin-right: 4px;"></i>
                  <span>{tab.shortLabel ?? tab.label}</span>
                </button>
              )}
            </For>
          </div>
          <Show when={activeTab() === "collections"}>
            <div class="ds-subtabs-right">
              <button
                type="button"
                class="win-button ds-btn-sm"
                style="display:inline-flex;align-items:center;gap:4px;height:22px;min-height:22px;max-height:22px;box-sizing:border-box;padding:0 8px;font-size:11px;"
                title={t("library.createCollectionTooltip")}
                onClick={() => setCreating(true)}
              >
                <AddIcon style={{ "font-size": "9px", "line-height": 1 }} />{" "}
                <span>{t("library.newCollectionButton")}</span>
              </button>
            </div>
          </Show>
          <Show when={activeTab() === "history"}>
            <div class="ds-subtabs-right">
              <ConfirmDeleteButton
                class="ds-btn-compact"
                title={t("library.clearHistoryTooltip")}
                onConfirm={clearHistoryAll}
                cssText="font-size:11px;padding:0 8px;height:22px;min-height:22px;max-height:22px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;"
              >
                <TrashIcon style={{ "line-height": 1 }} /> {t("library.clearHistoryButton")}
              </ConfirmDeleteButton>
            </div>
          </Show>
        </div>

        <div class="ds-library-tab-content">
          <div
            id="ds-library-tab-followed"
            class="ds-library-tab-pane"
            classList={{ "ds-hidden": activeTab() !== "followed" }}
          >
            <FollowedPane register={register("followed")} />
          </div>
          <div
            id="ds-library-tab-collections"
            class="ds-library-tab-pane"
            classList={{ "ds-hidden": activeTab() !== "collections" }}
          >
            <CollectionsPane
              register={register("collections")}
              onOpenDetail={openDetail}
              onCreateNew={() => setCreating(true)}
            />
          </div>
          <div
            id="ds-library-tab-bookmarks"
            class="ds-library-tab-pane"
            classList={{ "ds-hidden": activeTab() !== "bookmarks" }}
          >
            <BookmarksPane register={register("bookmarks")} />
          </div>
          <div
            id="ds-library-tab-history"
            class="ds-library-tab-pane"
            classList={{ "ds-hidden": activeTab() !== "history" }}
          >
            <HistoryPane register={register("history")} />
          </div>
        </div>
      </Show>
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
      showBanner(t("library.createdCollectionBanner", { name: n }));
      props.onClose();
      props.onCreated();
    } catch (err) {
      const msg = errorMessage(err);
      showBanner(t("library.createCollectionError", { msg }));
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
            {t("library.createCollectionNameLabel")}
          </label>
          <div class="input-wrapper" style="width:100%;">
            <input
              ref={inputEl}
              type="text"
              class="input-field has-clear"
              placeholder={t("library.createCollectionNamePlaceholder")}
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
              title={t("common.clear")}
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
        title={t("library.refreshLibraryTooltip")}
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
                  <RefreshIcon /> <span class="ds-btn-text">{t("library.refreshLibraryButton")}</span>
                </>
              }
            >
              <CheckIcon /> <span class="ds-btn-text">{t("library.refreshUpdated")}</span>
            </Show>
          }
        >
          <RefreshIcon spin={true} /> <span class="ds-btn-text">{t("library.refreshRefreshing")}</span>
        </Show>
      </button>
      <button
        type="button"
        class="win-button ds-btn-compact"
        title={t("library.cacheManagementTooltip")}
        onClick={() => navigate({ view: "cache" })}
      >
        <StorageIcon /> <span class="ds-btn-text">{t("library.cacheManagementButton")}</span>
      </button>
      <button
        type="button"
        class="win-button ds-btn-compact"
        title={t("library.seriesBlacklistTooltip")}
        onClick={() => navigate({ view: "blacklist" })}
      >
        <BlacklistIcon /> <span class="ds-btn-text">{t("library.seriesBlacklistButton")}</span>
      </button>
    </>
  );
}
