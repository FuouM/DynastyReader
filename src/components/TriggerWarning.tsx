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
        <span style="color:#d9534f;">
          <IconText icon={<WarningIcon />}>{t("dialogs.triggerWarning.title")}</IconText>
        </span>
      }
      onClose={props.onClose}
      footer={
        <div style="display:flex;justify-content:flex-end;gap:8px;width:100%;">
          <DsButton
            className="ds-modal-cancel"
            cssText="min-width:70px;"
            onClick={props.onClose}
          >
            {t("dialogs.triggerWarning.cancelButton")}
          </DsButton>
          <IconButton
            className="primary ds-modal-proceed"
            cssText="min-width:85px;background:#dc3545;border-color:#b02a37;color:#fff;"
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
        <div class="ds-label" style="word-break:break-word;">
          {props.title}
        </div>
        <div style="font-size:11px;color:var(--sys-text-muted,#555);line-height:1.4;">
          {t("dialogs.triggerWarning.message", { title: props.title })}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;max-height:90px;overflow-y:auto;padding:2px 0;">
          <For each={props.matchedTags}>
            {(tag) => (
              <span class="tag-pill" style="background:var(--ds-warn-bg);border:1px solid var(--ds-warn-border);color:var(--ds-warn-text);font-weight:600;font-size:11px;padding:2px 7px;">
                <BlacklistIcon filled={true} /> {tag}
              </span>
            )}
          </For>
        </div>
        <div class="ds-muted" style="font-size:11px;color:#777;margin-top:2px;">
          {t("dialogs.triggerWarning.proceedPrompt")}
        </div>
      </div>
    </Modal>
  );
}