/**
 * Keyboard Shortcuts Cheatsheet Overlay (HUD).
 * Opened via ? or F1 or topbar/menu action to display active keybindings.
 */

import { createSignal, For, Show } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { Button, IconText } from "./Button";
import { t } from "../i18n";
import { HOTKEY_DEFINITIONS } from "../hotkeys/registry";
import { getHotkeys } from "../hotkeys/hotkeys-store";
import { formatKeyCombo } from "../hotkeys/key-combo";
import { openSettingsDialog } from "../hotkeys/GlobalShortcuts";

export function HotkeyCheatsheetModal() {
  const [open, setOpen] = createSignal(false);

  makeEventListener(window, "ds-open-cheatsheet", () => setOpen(true));

  const readerShortcuts = HOTKEY_DEFINITIONS.filter((d) => d.scope === "reader");
  const globalShortcuts = HOTKEY_DEFINITIONS.filter((d) => d.scope === "global");

  const handleOpenCustomizer = () => {
    setOpen(false);
    openSettingsDialog();
  };

  return (
    <Modal
      open={open()}
      backdropId="ds-cheatsheet-backdrop"
      title={
        <IconText icon={<Icon name="keyboard" />}>
          {t("settings.hotkeys.cheatsheetTitle")}
        </IconText>
      }
      width={640}
      onClose={() => setOpen(false)}
      footer={
        <div class="ds-row-between ds-w-full">
          <Button
            className="ds-btn-compact"
            icon={<Icon name="sliders" />}
            text={t("settings.sections.hotkeys")}
            onClick={handleOpenCustomizer}
          />
          <Button
            className="primary ds-modal-done"
            text={t("common.close")}
            onClick={() => setOpen(false)}
          />
        </div>
      }
    >
      <div class="ds-cheatsheet-grid">
        <div class="ds-cheatsheet-col">
          <div class="ds-cheatsheet-header">
            <Icon name="book" />
            <span>{t("settings.hotkeys.categories.reader")}</span>
          </div>
          <div class="ds-cheatsheet-list">
            <For each={readerShortcuts}>
              {(def) => {
                const keys = () => getHotkeys(def.id);
                return (
                  <Show when={keys().length > 0}>
                    <div class="ds-cheatsheet-row">
                      <span class="ds-cheatsheet-label">{def.label}</span>
                      <div class="ds-cheatsheet-keys">
                        <For each={keys()}>
                          {(k) => <kbd class="ds-kbd">{formatKeyCombo(k)}</kbd>}
                        </For>
                      </div>
                    </div>
                  </Show>
                );
              }}
            </For>
          </div>
        </div>

        <div class="ds-cheatsheet-col">
          <div class="ds-cheatsheet-header">
            <Icon name="compass" />
            <span>{t("settings.hotkeys.categories.navigation")}</span>
          </div>
          <div class="ds-cheatsheet-list">
            <For each={globalShortcuts}>
              {(def) => {
                const keys = () => getHotkeys(def.id);
                return (
                  <Show when={keys().length > 0}>
                    <div class="ds-cheatsheet-row">
                      <span class="ds-cheatsheet-label">{def.label}</span>
                      <div class="ds-cheatsheet-keys">
                        <For each={keys()}>
                          {(k) => <kbd class="ds-kbd">{formatKeyCombo(k)}</kbd>}
                        </For>
                      </div>
                    </div>
                  </Show>
                );
              }}
            </For>
          </div>
        </div>
      </div>
    </Modal>
  );
}
