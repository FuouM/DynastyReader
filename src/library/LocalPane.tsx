import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { makeEventListener } from "@solid-primitives/event-listener";
import { navigate, dbReady, route, setSessionTab } from "../stores";
import { getLocalSeries } from "../db/local.repo";
import type { LocalSeriesRow } from "../db/local.repo";
import * as ipc from "../ipc";
import { showBanner } from "../stores/topbar";
import { formatBytes } from "../utils/formatting";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
import { Button, DsSelect, IconButton } from "../components/Button";
import { InputField } from "../components/InputField";
import { Modal } from "../components/Modal";
import type { ArchiveScanResult, FolderScanResult } from "../ipc";
import { Loading } from "../components/Loading";
import { AddIcon, FolderIcon, StorageIcon } from "../components/Icon";
import { LibraryItemRow } from "./LibraryItemRow";
import { persistedSignal } from "../lib/persisted-signal";

type LocalSortMode = "updated_desc" | "alphabetical" | "page_count" | "date_added";

interface ImportProgressPayload {
  current: number;
  total: number;
  phase: "extract" | "register" | "done";
}
import type { LibraryPaneApi } from "./panes";
export function LocalPane(props: { register: (api: LibraryPaneApi) => void }) {
  const [tick, setTick] = createSignal(0);
  // Defer the first fetch until migrations have run; otherwise the resource
  // fires during bootstrap's render-before-init window and throws
  // "no such table: local_series" before v4 is applied.
  const [data, { refetch }] = createResource(
    () => (dbReady() ? tick() : undefined),
    async () => getLocalSeries(),
  );

  // Refetch once when dbReady flips from false -> true (bootstrap completed).
  createEffect(() => {
    if (dbReady()) setTick((v) => v + 1);
  });

  const [scanning, setScanning] = createSignal(false);
  const [scanResult, setScanResult] = createSignal<ArchiveScanResult | null>(null);
  const [scanPath, setScanPath] = createSignal<string | null>(null);
  const [editTitle, setEditTitle] = createSignal("");
  const [importing, setImporting] = createSignal(false);

  // QoL-L1: determinate import progress driven by `local://import-progress`.
  const [importProgress, setImportProgress] = createSignal<ImportProgressPayload | null>(null);

  // QoL-L2: transient client-side search filter + persisted sort mode.
  const [searchQuery, setSearchQuery] = createSignal("");
  const [sortMode, setSortMode] = persistedSignal<LocalSortMode>("updated_desc", {
    name: "ds_local_sort",
    deserialize: (v) =>
      v === "alphabetical" || v === "page_count" || v === "date_added" ? v : "updated_desc",
  });

  let importListenMounted = true;
  let importUnlisten: UnlistenFn | null = null;
  onMount(() => {
    void listen<ImportProgressPayload>("local://import-progress", (event) => {
      if (event.payload) setImportProgress(event.payload);
    })
      .then((fn) => {
        if (importListenMounted) importUnlisten = fn;
        else fn();
      })
      .catch(() => {});
  });
  onCleanup(() => {
    importListenMounted = false;
    importUnlisten?.();
    importUnlisten = null;
  });

  const visibleRows = createMemo(() => {
    const rows = data();
    if (!rows) return undefined;
    const q = searchQuery().trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          r.title.toLowerCase().includes(q) || (r.author ?? "").toLowerCase().includes(q)
        )
      : [...rows];
    const mode = sortMode();
    if (mode === "alphabetical") {
      filtered.sort((a, b) => a.title.localeCompare(b.title));
    } else if (mode === "page_count") {
      filtered.sort((a, b) => b.total_pages - a.total_pages);
    } else if (mode === "date_added") {
      filtered.sort((a, b) => b.created_at - a.created_at);
    } else {
      filtered.sort((a, b) => b.updated_at - a.updated_at);
    }
    return filtered;
  });

  // Edit modal state
  const [editRow, setEditRow] = createSignal<LocalSeriesRow | null>(null);
  const [editSeriesTitle, setEditSeriesTitle] = createSignal("");
  const [editAuthor, setEditAuthor] = createSignal("");
  const [editDescription, setEditDescription] = createSignal("");
  const [newCoverPath, setNewCoverPath] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);

  // Folder import state
  const [folderScanResult, setFolderScanResult] = createSignal<FolderScanResult | null>(null);
  const [folderScanPath, setFolderScanPath] = createSignal<string | null>(null);
  const [folderSeriesTitle, setFolderSeriesTitle] = createSignal("");
  const [folderChapterTitle, setFolderChapterTitle] = createSignal("");
  const [folderCoverPath, setFolderCoverPath] = createSignal<string | null>(null);
  const [importMenuOpen, setImportMenuOpen] = createSignal(false);
  let importMenuRef: HTMLDivElement | undefined;

  const totalBytes = createMemo(() =>
    data()?.reduce((sum, r) => sum + (r.total_size_bytes ?? 0), 0) ?? 0
  );

  // Click outside to close import menu
  createEffect(() => {
    if (!importMenuOpen()) return;
    const handle = (ev: MouseEvent) => {
      if (importMenuRef && !importMenuRef.contains(ev.target as Node)) {
        setImportMenuOpen(false);
      }
    };
    makeEventListener(document, "click", handle);
  });

  props.register({
    reset: () => setTick((v) => v + 1),
    refetch: async () => {
      setTick((v) => v + 1);
      await refetch();
    },
  });
  const pickAndScan = async (): Promise<void> => {
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: "Comic Archive", extensions: ["cbz", "zip"] }],
      });
      if (!picked || Array.isArray(picked)) return;
      setScanning(true);
      const res = await ipc.scanArchive(picked as string);
      setScanPath(picked as string);
      setScanResult(res);
      setEditTitle(res.series_title);
    } catch (err) {
      showBanner(errorMessage(err));
    } finally {
      setScanning(false);
    }
  };

  const doImport = async (): Promise<void> => {
    const p = scanPath();
    const sr = scanResult();
    if (!p || !sr) return;
    const title = editTitle().trim() || sr.series_title;
    setImporting(true);
    setImportProgress(null);
    try {
      const permalink = await ipc.importArchive(p, { title });
      showBanner(t("local.importedBanner", { title }));
      setScanResult(null);
      setScanPath(null);
      void refetch();
      // Navigate to series view for imported local series
      navigate({ view: "series", seriesPermalink: permalink, seriesName: title });
    } catch (err) {
      showBanner(errorMessage(err));
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };
  const pickAndScanFolder = async (): Promise<void> => {
    setImportMenuOpen(false);
    try {
      const picked = await open({ directory: true, multiple: false });
      if (!picked || Array.isArray(picked)) return;
      setScanning(true);
      const res = await ipc.scanFolder(picked as string);
      setFolderScanPath(picked as string);
      setFolderScanResult(res);
      setFolderSeriesTitle(res.series_title);
      setFolderChapterTitle(t("local.chapterTitleDefault"));
      setFolderCoverPath(null);
    } catch (err) {
      showBanner(errorMessage(err));
    } finally {
      setScanning(false);
    }
  };

  const pickFolderCover = async (): Promise<void> => {
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png", "webp", "avif", "bmp", "gif"] }],
      });
      if (!picked || Array.isArray(picked)) return;
      setFolderCoverPath(picked as string);
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const doFolderImport = async (): Promise<void> => {
    const p = folderScanPath();
    const sr = folderScanResult();
    if (!p || !sr) return;
    const title = folderSeriesTitle().trim() || sr.series_title;
    const chapterTitle = folderChapterTitle().trim() || t("local.chapterTitleDefault");
    setImporting(true);
    try {
      const permalink = await ipc.importFolder(p, {
        title,
        chapter_title: chapterTitle,
        cover_path: folderCoverPath(),
      });
      showBanner(t("local.importedBanner", { title }));
      setFolderScanResult(null);
      setFolderScanPath(null);
      setFolderCoverPath(null);
      void refetch();
      navigate({ view: "series", seriesPermalink: permalink, seriesName: title });
    } catch (err) {
      showBanner(errorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (permalink: string): Promise<void> => {
    try {
      await ipc.deleteLocalSeries(permalink);
      setSessionTab((cur) => {
        if (!cur) return null;
        const sPerm = cur.route.seriesPermalink;
        const chPerm = cur.route.chapterPermalink;
        const slug = permalink.replace(/^local:/, "");
        if (sPerm === permalink || sPerm === slug || chPerm?.startsWith(permalink) || chPerm?.startsWith(`local:${slug}`)) {
          return null;
        }
        return cur;
      });
      const currentRoute = route();
      const curSlug = permalink.replace(/^local:/, "");
      if (
        (currentRoute.view === "series" && (currentRoute.seriesPermalink === permalink || currentRoute.seriesPermalink === curSlug)) ||
        (currentRoute.view === "reader" && (currentRoute.chapterPermalink?.startsWith(permalink) || currentRoute.chapterPermalink?.startsWith(`local:${curSlug}`)))
      ) {
        navigate({ view: "library", libraryTab: "local" });
      }
      showBanner(t("cache.deletedWorkSuccess", { name: permalink }));
      void refetch();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const openEdit = (row: LocalSeriesRow): void => {
    setEditRow(row);
    setEditSeriesTitle(row.title);
    setEditAuthor(row.author ?? "");
    setEditDescription(row.description ?? "");
    setNewCoverPath(null);
  };

  const closeEdit = (): void => {
    if (saving()) return;
    setEditRow(null);
    setNewCoverPath(null);
  };

  const pickNewCover = async (): Promise<void> => {
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png", "webp", "avif", "bmp", "gif"] }],
      });
      if (!picked || Array.isArray(picked)) return;
      setNewCoverPath(picked as string);
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const doEdit = async (): Promise<void> => {
    const row = editRow();
    if (!row) return;
    const title = editSeriesTitle().trim() || row.title;
    const author = editAuthor().trim() || null;
    const description = editDescription().trim() || null;
    setSaving(true);
    try {
      await ipc.updateLocalSeries(row.permalink, {
        title,
        author,
        description,
        new_cover_path: newCoverPath(),
      });
      showBanner(t("local.savedBanner", { title }));
      setEditRow(null);
      setNewCoverPath(null);
      void refetch();
    } catch (err) {
      showBanner(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="ds-local-pane">
      <div class="ds-local-pane-actions" style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div ref={importMenuRef} style="position:relative;">
            <IconButton
              icon={<AddIcon />}
              text={t("local.importMenuLabel")}
              onClick={() => setImportMenuOpen((v) => !v)}
              disabled={scanning()}
            />
            <Show when={importMenuOpen()}>
              <div
                class="ds-popup-card"
                style="position:absolute;top:calc(100% + 4px);left:0;min-width:180px;z-index:20;display:flex;flex-direction:column;padding:4px;gap:2px;"
                onClick={(e) => e.stopPropagation()}
              >
                <Button text={t("local.importCbz")} onClick={() => { setImportMenuOpen(false); void pickAndScan(); }} />
                <Button text={t("local.importFolder")} onClick={() => void pickAndScanFolder()} />
              </div>
            </Show>
          </div>
          <Show when={scanning()}>
            <span class="ds-muted" style="align-self:center;">{t("local.scanning")}</span>
          </Show>
          <Show when={data() && data()!.length > 0}>
            <InputField
              value={searchQuery()}
              onInput={setSearchQuery}
              placeholder={t("local.searchPlaceholder")}
              style="width:180px;"
            />
            <DsSelect
              value={sortMode()}
              onChange={(v) => setSortMode(v as LocalSortMode)}
              options={[
                { value: "updated_desc", label: t("local.sortUpdated") },
                { value: "alphabetical", label: t("local.sortAlphabetical") },
                { value: "page_count", label: t("local.sortPageCount") },
                { value: "date_added", label: t("local.sortDateAdded") },
              ]}
            />
          </Show>
        </div>
        <Show when={data() && data()!.length > 0}>
          <span class="ds-muted" style="font-size:11.5px;display:inline-flex;align-items:center;gap:4px;">
            <StorageIcon />
            <span>
              {t("local.seriesCount", { count: data()!.length })}
              <Show when={totalBytes() > 0}>
                {" "}({formatBytes(totalBytes())})
              </Show>
            </span>
          </span>
        </Show>
      </div>
      <Show when={scanResult()}>
        <Modal
          open={true}
          onClose={() => {
            if (!importing()) {
              setScanResult(null);
              setScanPath(null);
            }
          }}
          title={t("local.importTitle", { name: scanResult()!.file_name })}
          body={
            <div class="ds-form-stack">
              <label class="ds-form-label-sm">{t("local.seriesTitleLabel")}</label>
              <InputField value={editTitle()} onInput={setEditTitle} placeholder={scanResult()!.series_title} />
              <div class="ds-muted" style="font-size:12px;">
                {t("local.chapterPagesSummary", { chapters: scanResult()!.chapters.length, pages: scanResult()!.total_pages })}
              </div>
              <For each={scanResult()!.chapters}>
                {(ch) => (
                  <div class="ds-muted" style="font-size:12px;">
                    {ch.title} — {ch.page_count} pages
                  </div>
                )}
              </For>
              <div style="margin-top:8px; border:1px solid var(--ds-border, #ddd); border-radius:6px; max-height:220px; overflow:auto; padding:6px; background:var(--ds-bg-subtle, rgba(0,0,0,0.02))">
                <div style="font-size:11px; font-weight:600; margin-bottom:6px;">{t("local.previewTitle", { count: scanResult()!.total_pages })}</div>
                <For each={scanResult()!.chapters}>
                  {(ch) => (
                    <div style="margin-bottom:8px;">
                      <div style="font-size:11px; font-weight:600; opacity:0.8; margin-bottom:2px;">{ch.title}</div>
                      <For each={ch.files}>
                        {(f, idx) => {
                          const ext = f.split(".").pop()?.toLowerCase() ?? "jpg";
                          const out = `p${String(idx()).padStart(3, "0")}.${ext}`;
                          return (
                            <div style="font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; display:flex; gap:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                              <span style="opacity:0.5; min-width:28px; text-align:right;">{String(idx() + 1).padStart(2, "0")}.</span>
                              <span style="flex:1; overflow:hidden; text-overflow:ellipsis;">{f}</span>
                              <span style="opacity:0.5;">→</span>
                              <span>{out}</span>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  )}
                </For>
              </div>
              <Show when={importing()}>
                <div style="display:flex;flex-direction:column;gap:4px;">
                  <div class="ds-muted" style="font-size:12px;">
                    {importProgress()?.phase === "register"
                      ? t("local.importProgressRegister")
                      : t("local.importProgressExtract", {
                          current: importProgress()?.current ?? 0,
                          total: importProgress()?.total ?? scanResult()!.total_pages,
                        })}
                  </div>
                  <div class="ds-progress-track" role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={importProgress()?.total ?? scanResult()!.total_pages}
                    aria-valuenow={importProgress()?.current ?? 0}
                  >
                    <div
                      class="ds-progress-fill"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            ((importProgress()?.current ?? 0) /
                              Math.max(1, importProgress()?.total ?? scanResult()!.total_pages)) * 100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </Show>
            </div>
          }
          footer={
            <div class="ds-modal-footer-actions">
              <Button text={t("common.cancel")} onClick={() => { setScanResult(null); setScanPath(null); }} disabled={importing()} />
              <IconButton icon={<AddIcon />} text={importing() ? t("local.importing") : t("local.importButton")} onClick={() => void doImport()} disabled={importing()} className="primary" />
            </div>
          }
        />
      </Show>

      <Show when={folderScanResult()}>
        <Modal
          open={true}
          onClose={() => {
            if (!importing()) {
              setFolderScanResult(null);
              setFolderScanPath(null);
              setFolderCoverPath(null);
            }
          }}
          title={t("local.importFolderTitle", { name: folderScanResult()!.folder_name })}
          body={
            <div class="ds-form-stack">
              <label class="ds-form-label-sm">{t("local.seriesTitleLabel")}</label>
              <InputField value={folderSeriesTitle()} onInput={setFolderSeriesTitle} placeholder={folderScanResult()!.series_title} />
              <label class="ds-form-label-sm">{t("local.chapterTitleLabel")}</label>
              <InputField value={folderChapterTitle()} onInput={setFolderChapterTitle} placeholder={t("local.chapterTitleDefault")} />
              <div class="ds-muted" style="font-size:12px;">
                {t("local.folderSummary", { pages: folderScanResult()!.page_count })}
              </div>
              <label class="ds-form-label-sm">{t("local.coverLabel")}</label>
              <div style="display:flex;align-items:center;gap:8px;">
                <Button text={t("local.newCoverButton")} onClick={() => void pickFolderCover()} disabled={importing()} />
                <Show when={folderCoverPath()}>
                  <span class="ds-muted" style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    {t("local.newCoverSelected", { name: folderCoverPath()!.split(/[/\\]/).pop() ?? "" })}
                  </span>
                  <Button text={t("local.newCoverRemove")} onClick={() => setFolderCoverPath(null)} disabled={importing()} />
                </Show>
                <Show when={!folderCoverPath()}>
                  <span class="ds-muted" style="font-size:12px;">{t("local.newCoverKeepHint")}</span>
                </Show>
              </div>
              <div style="margin-top:8px; border:1px solid var(--ds-border, #ddd); border-radius:6px; max-height:220px; overflow:auto; padding:6px; background:var(--ds-bg-subtle, rgba(0,0,0,0.02))">
                <div style="font-size:11px; font-weight:600; margin-bottom:6px;">{t("local.previewTitle", { count: folderScanResult()!.page_count })}</div>
                <For each={folderScanResult()!.files}>
                  {(f, idx) => {
                    const ext = f.split(".").pop()?.toLowerCase() ?? "jpg";
                    const out = `p${String(idx()).padStart(3, "0")}.${ext}`;
                    return (
                      <div style="font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; display:flex; gap:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        <span style="opacity:0.5; min-width:28px; text-align:right;">{String(idx() + 1).padStart(2, "0")}.</span>
                        <span style="flex:1; overflow:hidden; text-overflow:ellipsis;">{f}</span>
                        <span style="opacity:0.5;">→</span>
                        <span>{out}</span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          }
          footer={
            <div class="ds-modal-footer-actions">
              <Button
                text={t("common.cancel")}
                onClick={() => { setFolderScanResult(null); setFolderScanPath(null); setFolderCoverPath(null); }}
                disabled={importing()}
              />
              <IconButton
                icon={<AddIcon />}
                text={importing() ? t("local.importing") : t("local.importButton")}
                onClick={() => void doFolderImport()}
                disabled={importing()}
                className="primary"
              />
            </div>
          }
        />
      </Show>

      <Show when={editRow()}>
        <Modal
          open={true}
          onClose={closeEdit}
          title={t("local.editTitle", { name: editRow()!.title })}
          body={
            <div class="ds-form-stack">
              <label class="ds-form-label-sm">{t("local.seriesTitleLabel")}</label>
              <InputField value={editSeriesTitle()} onInput={setEditSeriesTitle} placeholder={editRow()!.title} />
              <label class="ds-form-label-sm">{t("local.authorLabel")}</label>
              <InputField value={editAuthor()} onInput={setEditAuthor} placeholder="" />
              <label class="ds-form-label-sm">{t("local.descriptionLabel")}</label>
              <InputField value={editDescription()} onInput={setEditDescription} placeholder="" />
              <label class="ds-form-label-sm">{t("local.coverLabel")}</label>
              <div style="display:flex;align-items:center;gap:8px;">
                <Button text={t("local.newCoverButton")} onClick={() => void pickNewCover()} disabled={saving()} />
                <Show when={newCoverPath()}>
                  <span class="ds-muted" style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    {t("local.newCoverSelected", { name: newCoverPath()!.split(/[/\\]/).pop() ?? "" })}
                  </span>
                  <Button text={t("local.newCoverRemove")} onClick={() => setNewCoverPath(null)} disabled={saving()} />
                </Show>
                <Show when={!newCoverPath()}>
                  <span class="ds-muted" style="font-size:12px;">{t("local.newCoverKeepHint")}</span>
                </Show>
              </div>
            </div>
          }
          footer={
            <div class="ds-modal-footer-actions">
              <Button text={t("common.cancel")} onClick={closeEdit} disabled={saving()} />
              <IconButton
                icon={<i class="bi bi-check-lg" />}
                text={saving() ? t("local.saving") : t("local.saveButton")}
                onClick={() => void doEdit()}
                disabled={saving()}
                className="primary"
              />
            </div>
          }
        />
      </Show>

      <Show when={data.loading}>
        <Loading />
      </Show>
      <Show when={data() !== undefined && (data()!.length === 0)}>
        <div class="ds-empty-state" style="padding:24px;text-align:center;">
          <FolderIcon />
          <div class="ds-muted">{t("local.emptyHint")}</div>
        </div>
      </Show>
      <Show when={visibleRows() !== undefined && visibleRows()!.length > 0}>
        <For each={visibleRows()!}>
          {(row) => (
            <LibraryItemRow
              title={row.title}
              subtitle={`${row.chapter_count} chapter(s) · ${row.total_pages} pages${(row.total_size_bytes ?? 0) > 0 ? ` · ${formatBytes(row.total_size_bytes!)}` : ""}${row.author ? ` · ${row.author}` : ""}`}
              badge="Local"
              cover={row.cover_path}
              coverAlt={row.title}
              onOpen={() => navigate({ view: "series", seriesPermalink: row.permalink, seriesName: row.title })}
              actionLabel={t("common.open")}
              actionIcon="bi-folder2-open"
              deleteTitle={t("local.deleteTooltip")}
              editTitle={t("local.editTooltip")}
              onEdit={() => openEdit(row)}
              onDelete={() => handleDelete(row.permalink)}
            />
          )}
        </For>
      </Show>
      <Show when={data() !== undefined && data()!.length > 0 && visibleRows() !== undefined && visibleRows()!.length === 0}>
        <div class="ds-muted" style="padding:12px;text-align:center;">{t("local.noSearchResults")}</div>
      </Show>
    </div>
  );
}
