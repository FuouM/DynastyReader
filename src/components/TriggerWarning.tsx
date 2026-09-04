/**
 * Accessible, WinForms-style Content/Trigger Warning confirmation modal for
 * items containing blacklisted tags in "Trigger Warning" mode. Port of `trigger-warning.ts`.
 */

import { For } from "solid-js";
import { t } from "../i18n";
import { Modal } from "./Modal";
import { DsButton, IconText, IconButton } from "./Button";
import { WarningIcon, ExternalLinkIcon, BlacklistIcon } from "./Icon";

export interface TriggerWarningModalProps {
  open: boolean;
  title: string;
  matchedTags: string[];
  onProceed: () => void;
  onClose: () => void;
}

export function TriggerWarningModal(props: TriggerWarningModalProps) {
  return (
    <Modal
      open={props.open}
      backdropId="ds-trigger-warning-backdrop"
      width={380}
      title={
        <span class="ds-trigger-title--warn">
          <IconText icon={<WarningIcon />}>{t("dialogs.triggerWarning.title")}</IconText>
        </span>
      }
      onClose={props.onClose}
      footer={
        <div class="ds-modal-footer-actions">
          <DsButton
            className="ds-modal-cancel"
            cssText="min-width:70px;"
            onClick={props.onClose}
          >
            {t("dialogs.triggerWarning.cancelButton")}
          </DsButton>
          <IconButton
            className="ds-modal-proceed ds-danger"
            cssText="min-width:85px;"
            icon={<ExternalLinkIcon />}
            text={t("dialogs.triggerWarning.proceedButton")}
            onClick={() => {
              const proceed = props.onProceed;
              props.onClose();
              proceed();
            }}
          />
        </div>
      }
    >
      <div class="ds-col">
        <div class="ds-label ds-trigger-label">
          {props.title}
        </div>
        <div class="ds-trigger-message">
          {t("dialogs.triggerWarning.message", { title: props.title })}
        </div>
        <div class="ds-trigger-tags">
          <For each={props.matchedTags}>
            {(tag) => (
              <span class="tag-pill ds-chip-warn-inline">
                <BlacklistIcon filled={true} /> {tag}
              </span>
            )}
          </For>
        </div>
        <div class="ds-muted ds-trigger-proceed">
          {t("dialogs.triggerWarning.proceedPrompt")}
        </div>
      </div>
    </Modal>
  );
}