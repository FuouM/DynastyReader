/**
 * Consolidated local series modals: Archive Import, Folder Import, and Series Metadata Edit.
 */

import { For, Show } from "solid-js";
import { Button, IconButton } from "../components/Button";
import { AddIcon } from "../components/Icon";
import { InputField } from "../components/InputField";
import { Modal } from "../components/Modal";
import type { ArchiveScanResult, FolderScanResult } from "../ipc";
import type { LocalSeriesRow } from "../db/local.repo";
import { t } from "../i18n";

// ── 1. Archive Import Modal (CBZ) ──────────────────────────────────────────────

export interface ImportProgressPayload {
  current: number;
  total: number;
  phase: "extract" | "register" | "done";
}

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

// ── 2. Folder Import Modal ─────────────────────────────────────────────────────

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

// ── 3. Edit Local Series Modal ─────────────────────────────────────────────────

export interface EditLocalSeriesModalProps {
  row: LocalSeriesRow;
  title: string;
  onTitle: (val: string) => void;
  author: string;
  onAuthor: (val: string) => void;
  description: string;
  onDescription: (val: string) => void;
  newCoverPath: string | null;
  onPickCover: () => void;
  onRemoveCover: () => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function EditLocalSeriesModal(props: EditLocalSeriesModalProps) {
  return (
    <Modal
      open={true}
      onClose={props.onClose}
      title={t("local.editTitle", { name: props.row.title })}
      body={
        <div class="ds-form-stack">
          <label class="ds-form-label-sm">{t("local.seriesTitleLabel")}</label>
          <InputField
            value={props.title}
            onInput={props.onTitle}
            placeholder={props.row.title}
          />
          <label class="ds-form-label-sm">{t("local.authorLabel")}</label>
          <InputField
            value={props.author}
            onInput={props.onAuthor}
            placeholder=""
          />
          <label class="ds-form-label-sm">{t("local.descriptionLabel")}</label>
          <InputField
            value={props.description}
            onInput={props.onDescription}
            placeholder=""
          />
          <label class="ds-form-label-sm">{t("local.coverLabel")}</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <Button
              text={t("local.newCoverButton")}
              onClick={props.onPickCover}
              disabled={props.saving}
            />
            <Show when={props.newCoverPath}>
              <span
                class="ds-muted"
                style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
              >
                {t("local.newCoverSelected", {
                  name: props.newCoverPath!.split(/[/\\]/).pop() ?? "",
                })}
              </span>
              <Button
                text={t("local.newCoverRemove")}
                onClick={props.onRemoveCover}
                disabled={props.saving}
              />
            </Show>
            <Show when={!props.newCoverPath}>
              <span class="ds-muted" style="font-size:12px;">
                {t("local.newCoverKeepHint")}
              </span>
            </Show>
          </div>
        </div>
      }
      footer={
        <div class="ds-modal-footer-actions">
          <Button text={t("common.cancel")} onClick={props.onClose} disabled={props.saving} />
          <IconButton
            icon={<i class="bi bi-check-lg" />}
            text={props.saving ? t("local.saving") : t("local.saveButton")}
            onClick={props.onSave}
            disabled={props.saving}
            className="primary"
          />
        </div>
      }
    />
  );
}
