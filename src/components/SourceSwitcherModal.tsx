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
import { t } from "../i18n";
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

  const handleKeyDown = (ev: KeyboardEvent, index: number, list: Array<{ id: ContentProvider }>): void => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowRight") {
      ev.preventDefault();
      const nextIndex = (index + 1) % list.length;
      const nextBtn = document.getElementById(`ds-source-option-${list[nextIndex].id}`);
      nextBtn?.focus();
    } else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") {
      ev.preventDefault();
      const prevIndex = (index - 1 + list.length) % list.length;
      const prevBtn = document.getElementById(`ds-source-option-${list[prevIndex].id}`);
      prevBtn?.focus();
    }
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={t("sourceSwitcher.title")}
      width={460}
    >
      <div
        role="radiogroup"
        aria-label={t("sourceSwitcher.title")}
        style="display: flex; flex-direction: column; gap: 10px; padding: 4px 0;"
      >
        <div class="ds-muted" style="font-size: 12px; margin-bottom: 4px;">
          {t("sourceSwitcher.description")}
        </div>
        <For each={providersList()}>
          {(p, i) => {
            const isSelected = () => activeProvider() === p.id;
            return (
              <button
                type="button"
                role="radio"
                id={`ds-source-option-${p.id}`}
                class="win-button"
                classList={{ "win-button--active": isSelected() }}
                aria-checked={isSelected()}
                style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; cursor: pointer; text-align: left; width: 100%; border: 1px solid var(--sys-button-border, #ccc);"
                onClick={() => handleSelect(p.id)}
                onKeyDown={(ev) => handleKeyDown(ev, i(), providersList())}
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
              </button>
            );
          }}
        </For>
      </div>
    </Modal>
  );
}
