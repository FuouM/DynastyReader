import { createResource, createSignal, For, Show } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { navigate } from "../stores";
import { getLocalSeries } from "../db/local.repo";
import * as ipc from "../ipc";
import { showBanner } from "../stores/topbar";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
import { Button, ConfirmDeleteButton, IconButton } from "../components/Button";
import { InputField } from "../components/InputField";
import { Modal } from "../components/Modal";
import { Loading } from "../components/Loading";
import { AddIcon, TrashIcon, FolderIcon } from "../components/Icon";
import type { ArchiveScanResult } from "../ipc";
import type { LibraryPaneApi } from "./panes";

export function LocalPane(props: { register: (api: LibraryPaneApi) => void }) {
  const [tick, setTick] = createSignal(0);
  const [data, { refetch }] = createResource(tick, async () => getLocalSeries());

  const [scanning, setScanning] = createSignal(false);
  const [scanResult, setScanResult] = createSignal<ArchiveScanResult | null>(null);
  const [scanPath, setScanPath] = createSignal<string | null>(null);
  const [editTitle, setEditTitle] = createSignal("");
  const [importing, setImporting] = createSignal(false);

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
      showBanner(`Imported "${title}"`);
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
      <div class="ds-local-pane-actions" style="margin-bottom:12px;display:flex;gap:8px;">
        <IconButton icon={<AddIcon />} text="Import CBZ" onClick={() => void pickAndScan()} disabled={scanning()} />
        <Show when={scanning()}>
          <span class="ds-muted" style="align-self:center;">Scanning…</span>
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
          title={`Import "${scanResult()!.file_name}"`}
          body={
            <div class="ds-form-stack">
              <label class="ds-form-label-sm">Series title</label>
              <InputField value={editTitle()} onInput={setEditTitle} placeholder={scanResult()!.series_title} />
              <div class="ds-muted" style="font-size:12px;">
                {scanResult()!.chapters.length} chapter(s) · {scanResult()!.total_pages} pages
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
              <IconButton icon={<AddIcon />} text={importing() ? "Importing…" : "Import"} onClick={() => void doImport()} disabled={importing()} className="primary" />
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
          <div class="ds-muted">No local imports yet. Import a CBZ to get started.</div>
        </div>
      </Show>
      <Show when={data() !== undefined && data()!.length > 0}>
        <div class="ds-feed-list">
          <For each={data()!}>
            {(row) => (
              <div class="ds-feed-row" style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--ds-border);">
                <div style="flex:1;min-width:0;">
                  <div class="ds-feed-title" style="cursor:pointer;font-weight:600;" onClick={() => navigate({ view: "series", seriesPermalink: row.permalink, seriesName: row.title })}>
                    {row.title}
                  </div>
                  <div class="ds-muted" style="font-size:12px;">
                    {row.chapter_count} chapter(s) · {row.total_pages} pages
                    <Show when={row.author}> · {row.author}</Show>
                  </div>
                </div>
                <Button text="Open" onClick={() => navigate({ view: "series", seriesPermalink: row.permalink, seriesName: row.title })} />
                <ConfirmDeleteButton icon={<TrashIcon />} text="Delete" onConfirm={() => void handleDelete(row.permalink)} />
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
