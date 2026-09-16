import { Show } from "solid-js";
import { Button, IconButton } from "../../components/Button";
import { InputField } from "../../components/InputField";
import { Modal } from "../../components/Modal";
import type { LocalSeriesRow } from "../../db/local.repo";
import { t } from "../../i18n";

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
