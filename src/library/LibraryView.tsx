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
  For,
  Show,
  type Accessor,
} from "solid-js";
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
import { createMediaQuery } from "@solid-primitives/media";
import {
  clearHistory,
  createCollection,
} from "../db";
import { Button, ConfirmDeleteButton, IconText, IconButton } from "../components/Button";
import { InputField } from "../components/InputField";
import { Modal } from "../components/Modal";
import { SubTabs } from "../components/SubTabs";
import { GroupBox } from "../components/GroupBox";
import {
  RefreshIcon,
  CheckIcon,
  StorageIcon,
  BlacklistIcon,
  BookmarkIcon,
  FolderIcon,
  AddIcon,
  TrashIcon,
  Icon,
} from "../components/Icon";
import {
  FollowedPane,
  CollectionsPane,
  BookmarksPane,
  HistoryPane,
  type LibraryPaneApi,
} from "./panes";
import { LocalPane } from "./LocalPane";
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

export type LibraryTabId = "followed" | "collections" | "bookmarks" | "history" | "local";

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
  {
    id: "local",
    get label() { return "Local"; },
    get shortLabel() { return "Local"; },
    icon: "bi-folder",
  },
];

function LibraryGrid() {
  const [refreshing, setRefreshing] = createSignal(false);
  const [justUpdated, setJustUpdated] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  const isNarrow = createMediaQuery("(max-width: 680px)");

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

  const renderPanes = () => (
    <>
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
      <div
        id="ds-library-tab-local"
        class="ds-library-tab-pane"
        classList={{ "ds-hidden": activeTab() !== "local" }}
      >
        <LocalPane register={register("local")} />
      </div>
    </>
  );

  return (
    <div id="ds-library-container">
      <Show
        when={isNarrowOrMobile()}
        fallback={
          /* Desktop Master-Detail Split (WinForms Style) */
          <div class="ds-library-split">
            {/* ── Master Left Navigation GroupBox ── */}
            <GroupBox
              class="ds-library-master-box"
              title={<IconText icon={<Icon name="collection" />}>Categories</IconText>}
            >
              <div class="win-listbox ds-library-nav-list">
                <For each={getLibraryTabs()}>
                  {(tab) => (
                    <button
                      type="button"
                      class={`win-listbox-item ds-library-nav-item${activeTab() === tab.id ? " active" : ""}`}
                      onClick={() => switchTab(tab.id)}
                    >
                      <span class="ds-nav-icon">
                        <Icon name={tab.icon.replace(/^bi-/, "")} />
                      </span>
                      <span class="ds-nav-label">{tab.label}</span>
                    </button>
                  )}
                </For>
              </div>
            </GroupBox>

            {/* ── Detail Right Content GroupBox ── */}
            <GroupBox
              class="ds-library-detail-box"
              title={
                <span class="ds-icon-text">
                  <Show when={activeTab() === "followed"}>
                    <Icon name="bookmark-heart" /> {t("library.followed")}
                  </Show>
                  <Show when={activeTab() === "collections"}>
                    <FolderIcon /> {t("library.collections")}
                  </Show>
                  <Show when={activeTab() === "bookmarks"}>
                    <BookmarkIcon /> {t("library.bookmarks")}
                  </Show>
                  <Show when={activeTab() === "history"}>
                    <Icon name="clock-history" /> {t("library.history")}
                  </Show>
                  <Show when={activeTab() === "local"}>
                    <FolderIcon /> Local Imports
                  </Show>
                </span>
              }
              actions={
                <div class="ds-library-detail-actions">
                  <Show when={activeTab() === "collections"}>
                    <IconButton
                      icon={<AddIcon />}
                      text={t("library.newCollectionButton")}
                      title={t("library.createCollectionTooltip")}
                      onClick={() => setCreating(true)}
                    />
                  </Show>
                  <Show when={activeTab() === "history"}>
                    <ConfirmDeleteButton
                      icon={<TrashIcon />}
                      text={t("library.clearHistoryButton")}
                      title={t("library.clearHistoryTooltip")}
                      onConfirm={clearHistoryAll}
                    />
                  </Show>
                </div>
              }
            >
              <div class="ds-library-detail-content">
                {renderPanes()}
              </div>
            </GroupBox>
          </div>
        }
      >
        {/* Mobile SubTabs Layout */}
        <SubTabs
          tabs={getLibraryTabs()}
          activeTab={activeTab()}
          onSwitch={(id) => switchTab(id as LibraryTabId)}
          compact={isNarrowOrMobile()}
          right={
            <>
              <Show when={activeTab() === "collections"}>
                <IconButton
                  icon={<AddIcon />}
                  text={t("library.newCollectionButton")}
                  className="ds-btn-sm"
                  title={t("library.createCollectionTooltip")}
                  onClick={() => setCreating(true)}
                />
              </Show>
              <Show when={activeTab() === "history"}>
                <ConfirmDeleteButton
                  icon={<TrashIcon />}
                  text={t("library.clearHistoryButton")}
                  className="ds-btn-compact"
                  title={t("library.clearHistoryTooltip")}
                  onConfirm={clearHistoryAll}
                />
              </Show>
            </>
          }
        />

        <div class="ds-library-tab-content">
          {renderPanes()}
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
  createEffect(() => {
    if (!props.open()) {
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
        <div class="ds-form-stack">
          <label class="ds-form-label-sm">
            {t("library.createCollectionNameLabel")}
          </label>
          <InputField
            autofocus={true}
            placeholder={t("library.createCollectionNamePlaceholder")}
            value={name()}
            onInput={(val) => setName(val)}
            onEnter={() => void submit()}
          />
        </div>
      }
      footer={
        <div class="ds-modal-footer-actions">
          <button
            class="win-button ds-btn-sm ds-modal-cancel"
            onClick={props.onClose}
          >
            {t("common.cancel")}
          </button>
          <IconButton
            icon={<AddIcon />}
            text={t("library.createCollectionConfirm")}
            className="primary ds-modal-submit"
            disabled={creating()}
            onClick={() => void submit()}
          />
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
      <Button
        id="ds-library-refresh-btn"
        icon={
          <Show
            when={props.refreshing()}
            fallback={
              <Show when={props.justUpdated()} fallback={<RefreshIcon />}>
                <CheckIcon />
              </Show>
            }
          >
            <RefreshIcon spin={true} />
          </Show>
        }
        text={
          props.refreshing()
            ? t("library.refreshRefreshing")
            : props.justUpdated()
              ? t("library.refreshUpdated")
              : t("library.refreshLibraryButton")
        }
        title={t("library.refreshLibraryTooltip")}
        disabled={props.refreshing() || props.justUpdated()}
        onClick={props.onRefresh}
      />
      <Button
        icon={<StorageIcon />}
        text={t("library.cacheManagementButton")}
        title={t("library.cacheManagementTooltip")}
        onClick={() => navigate({ view: "cache" })}
      />
      <Button
        icon={<BlacklistIcon />}
        text={t("library.seriesBlacklistButton")}
        title={t("library.seriesBlacklistTooltip")}
        onClick={() => navigate({ view: "blacklist" })}
      />
    </>
  );
}
