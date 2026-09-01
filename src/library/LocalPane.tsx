import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { navigate, dbReady } from "../stores";
import { getLocalSeries } from "../db/local.repo";
import * as ipc from "../ipc";
import { showBanner } from "../stores/topbar";
import { formatBytes } from "../lib/format";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
import { Button, IconButton } from "../components/Button";
import { InputField } from "../components/InputField";
import { Modal } from "../components/Modal";
import { Loading } from "../components/Loading";
import { AddIcon, FolderIcon, StorageIcon } from "../components/Icon";
import type { ArchiveScanResult } from "../ipc";
import { LibraryItemRow } from "./LibraryItemRow";
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

  const totalBytes = createMemo(() =>
    data()?.reduce((sum, r) => sum + (r.total_size_bytes ?? 0), 0) ?? 0
  );

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
    }
  };

  const handleDelete = async (permalink: string): Promise<void> => {
    try {
      await ipc.deleteLocalSeries(permalink);
      showBanner(t("cache.deletedWorkSuccess", { name: permalink }));
      void refetch();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  return (
    <div class="ds-local-pane">
      <div class="ds-local-pane-actions" style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <IconButton icon={<AddIcon />} text={t("local.importCbz")} onClick={() => void pickAndScan()} disabled={scanning()} />
          <Show when={scanning()}>
            <span class="ds-muted" style="align-self:center;">{t("local.scanning")}</span>
          </Show>
        </div>
        <Show when={data() && data()!.length > 0}>
          <span class="ds-muted" style="font-size:11.5px;display:inline-flex;align-items:center;gap:4px;">
            <StorageIcon />
            <span>
              {data()!.length} {t("local.seriesCount", { count: data()!.length })}
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

      <Show when={data.loading}>
        <Loading />
      </Show>
      <Show when={data() !== undefined && (data()!.length === 0)}>
        <div class="ds-empty-state" style="padding:24px;text-align:center;">
          <FolderIcon />
          <div class="ds-muted">{t("local.emptyHint")}</div>
        </div>
      </Show>
      <Show when={data() !== undefined && data()!.length > 0}>
        <For each={data()!}>
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
              onDelete={() => handleDelete(row.permalink)}
            />
          )}
        </For>
      </Show>
    </div>
  );
}
