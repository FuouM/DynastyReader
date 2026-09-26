/**
 * Source Switcher Modal Dialog
 * Allows switching between discrete provider modes (Dynasty Scans vs MangaDex).
 * Keeps #ds-topbar untouched to maintain the 32px height constraint.
 */

import { For, Show } from "solid-js";
import { Modal } from "./Modal";
import { CheckIcon } from "./Icon";
import { activeProvider, PROVIDERS, type ContentProvider } from "../stores/provider";
import { switchProvider } from "../stores/router";

export interface SourceSwitcherModalProps {
  open: boolean;
  onClose: () => void;
}

export function SourceSwitcherModal(props: SourceSwitcherModalProps) {
  const providersList = () => Object.values(PROVIDERS);

  const handleSelect = (providerId: ContentProvider): void => {
    if (activeProvider() !== providerId) {
      switchProvider(providerId);
    }
    props.onClose();
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Select Content Source"
      width={460}
    >
      <div style="display: flex; flex-direction: column; gap: 10px; padding: 4px 0;">
        <div class="ds-muted" style="font-size: 12px; margin-bottom: 4px;">
          Choose an active provider. Each source operates with its own isolated library, history, and search filters.
        </div>
        <For each={providersList()}>
          {(p) => {
            const isSelected = () => activeProvider() === p.id;
            return (
              <div
                class="win-button ds-source-provider-card"
                classList={{ "win-button--active": isSelected() }}
                onClick={() => handleSelect(p.id)}
              >
                <div style="display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 600; font-size: 13px;">{p.name}</span>
                    <span
                      class="ds-chip"
                      style="font-size: 10px; padding: 1px 6px; border-radius: 3px;"
                    >
                      {p.badge}
                    </span>
                  </div>
                  <div class="ds-muted" style="font-size: 11px; line-height: 1.3;">
                    {p.description}
                  </div>
                </div>
                <Show when={isSelected()}>
                  <div style="display: flex; align-items: center; margin-left: 12px; color: var(--ds-accent);">
                    <CheckIcon size={16} />
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </Modal>
  );
}
