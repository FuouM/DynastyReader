import { For, Show } from "solid-js";
import { Button, IconButton } from "../../components/Button";
import { AddIcon } from "../../components/Icon";
import { InputField } from "../../components/InputField";
import { Modal } from "../../components/Modal";
import type { ArchiveScanResult } from "../../ipc";

export interface ImportProgressPayload {
  current: number;
  total: number;
  phase: "extract" | "register" | "done";
}
import { t } from "../../i18n";

export interface ArchiveImportModalProps {
  scanResult: ArchiveScanResult;
  editTitle: string;
  onEditTitle: (val: string) => void;
  importing: boolean;
  importProgress: ImportProgressPayload | null;
  onCancel: () => void;
  onImport: () => void;
}

export function ArchiveImportModal(props: ArchiveImportModalProps) {
  const sr = () => props.scanResult;

  return (
    <Modal
      open={true}
      onClose={props.onCancel}
      title={t("local.importTitle", { name: sr().file_name })}
      body={
        <div class="ds-form-stack">
          <label class="ds-form-label-sm">{t("local.seriesTitleLabel")}</label>
          <InputField
            value={props.editTitle}
            onInput={props.onEditTitle}
            placeholder={sr().series_title}
          />
          <div class="ds-muted" style="font-size:12px;">
            {t("local.chapterPagesSummary", {
              chapters: sr().chapters.length,
              pages: sr().total_pages,
            })}
          </div>
          <For each={sr().chapters}>
            {(ch) => (
              <div class="ds-muted" style="font-size:12px;">
                {ch.title} — {ch.page_count} pages
              </div>
            )}
          </For>
          <div style="margin-top:8px; border:1px solid var(--ds-border, #ddd); border-radius:6px; max-height:220px; overflow:auto; padding:6px; background:var(--ds-bg-subtle, rgba(0,0,0,0.02))">
            <div style="font-size:11px; font-weight:600; margin-bottom:6px;">
              {t("local.previewTitle", { count: sr().total_pages })}
            </div>
            <For each={sr().chapters}>
              {(ch) => (
                <div style="margin-bottom:8px;">
                  <div style="font-size:11px; font-weight:600; opacity:0.8; margin-bottom:2px;">
                    {ch.title}
                  </div>
                  <For each={ch.files}>
                    {(f, idx) => {
                      const ext = f.split(".").pop()?.toLowerCase() ?? "jpg";
                      const out = `p${String(idx()).padStart(3, "0")}.${ext}`;
                      return (
                        <div style="font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; display:flex; gap:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                          <span style="opacity:0.5; min-width:28px; text-align:right;">
                            {String(idx() + 1).padStart(2, "0")}.
                          </span>
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
          <Show when={props.importing}>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <div class="ds-muted" style="font-size:12px;">
                {props.importProgress?.phase === "register"
                  ? t("local.importProgressRegister")
                  : t("local.importProgressExtract", {
                      current: props.importProgress?.current ?? 0,
                      total: props.importProgress?.total ?? sr().total_pages,
                    })}
              </div>
              <div
                class="ds-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={props.importProgress?.total ?? sr().total_pages}
                aria-valuenow={props.importProgress?.current ?? 0}
              >
                <div
                  class="ds-progress-fill"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        ((props.importProgress?.current ?? 0) /
                          Math.max(1, props.importProgress?.total ?? sr().total_pages)) *
                          100,
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
          <Button text={t("common.cancel")} onClick={props.onCancel} />
          <IconButton
            icon={<AddIcon />}
            text={props.importing ? t("local.importing") : t("local.importButton")}
            onClick={props.onImport}
            disabled={props.importing}
            className="primary"
          />
        </div>
      }
    />
  );
}
