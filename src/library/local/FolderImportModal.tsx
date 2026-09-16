import { For, Show } from "solid-js";
import { Button, IconButton } from "../../components/Button";
import { AddIcon } from "../../components/Icon";
import { InputField } from "../../components/InputField";
import { Modal } from "../../components/Modal";
import type { FolderScanResult } from "../../ipc";
import { t } from "../../i18n";

export interface FolderImportModalProps {
  scanResult: FolderScanResult;
  seriesTitle: string;
  onSeriesTitle: (val: string) => void;
  chapterTitle: string;
  onChapterTitle: (val: string) => void;
  coverPath: string | null;
  onPickCover: () => void;
  onRemoveCover: () => void;
  importing: boolean;
  onCancel: () => void;
  onImport: () => void;
}

export function FolderImportModal(props: FolderImportModalProps) {
  const sr = () => props.scanResult;

  return (
    <Modal
      open={true}
      onClose={props.onCancel}
      title={t("local.importFolderTitle", { name: sr().folder_name })}
      body={
        <div class="ds-form-stack">
          <label class="ds-form-label-sm">{t("local.seriesTitleLabel")}</label>
          <InputField
            value={props.seriesTitle}
            onInput={props.onSeriesTitle}
            placeholder={sr().series_title}
          />
          <label class="ds-form-label-sm">{t("local.chapterTitleLabel")}</label>
          <InputField
            value={props.chapterTitle}
            onInput={props.onChapterTitle}
            placeholder={t("local.chapterTitleDefault")}
          />
          <div class="ds-muted" style="font-size:12px;">
            {t("local.folderSummary", { pages: sr().page_count })}
          </div>
          <label class="ds-form-label-sm">{t("local.coverLabel")}</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <Button
              text={t("local.newCoverButton")}
              onClick={props.onPickCover}
              disabled={props.importing}
            />
            <Show when={props.coverPath}>
              <span
                class="ds-muted"
                style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
              >
                {t("local.newCoverSelected", {
                  name: props.coverPath!.split(/[/\\]/).pop() ?? "",
                })}
              </span>
              <Button
                text={t("local.newCoverRemove")}
                onClick={props.onRemoveCover}
                disabled={props.importing}
              />
            </Show>
            <Show when={!props.coverPath}>
              <span class="ds-muted" style="font-size:12px;">
                {t("local.newCoverKeepHint")}
              </span>
            </Show>
          </div>
          <div style="margin-top:8px; border:1px solid var(--ds-border, #ddd); border-radius:6px; max-height:220px; overflow:auto; padding:6px; background:var(--ds-bg-subtle, rgba(0,0,0,0.02))">
            <div style="font-size:11px; font-weight:600; margin-bottom:6px;">
              {t("local.previewTitle", { count: sr().page_count })}
            </div>
            <For each={sr().files}>
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
