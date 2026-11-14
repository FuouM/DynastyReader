/**
 * Keyboard Shortcuts Cheatsheet Overlay (HUD).
 * Opened via ? or F1 or topbar/menu action to display active keybindings.
 */

import { createSignal, For, Show } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import { Modal, Icon, Button, IconText } from "soulwindow/solid";
import { t } from "../i18n";
import { HOTKEY_DEFINITIONS } from "../hotkeys/registry";
import { getHotkeys } from "../hotkeys/hotkeys-store";
import { formatKeyCombo } from "../hotkeys/key-combo";
import type { HotkeyDefinition } from "../hotkeys/types";
import { openSettingsDialog } from "../hotkeys/GlobalShortcuts";

function ShortcutColumn(props: { icon: string; title: string; defs: readonly HotkeyDefinition[] }) {
  return (
    <div class="ds-cheatsheet-col">
      <div class="ds-cheatsheet-header">
        <Icon name={props.icon} />
        <span>{props.title}</span>
      </div>
      <div class="ds-cheatsheet-list">
        <For each={props.defs}>
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
  );
}

export function HotkeyCheatsheetModal() {
  const [open, setOpen] = createSignal(false);

  makeEventListener(window, "ds-open-cheatsheet", () => setOpen(true));

  const readerShortcuts = HOTKEY_DEFINITIONS.filter((d) => d.scope === "reader");
  const globalShortcuts = HOTKEY_DEFINITIONS.filter((d) => d.scope === "global");

  const handleOpenCustomizer = (): void => {
    setOpen(false);
    openSettingsDialog({ page: "hotkeys", section: "hotkeys" });
  };

  return (
    <Modal
      open={open()}
      id="ds-cheatsheet-backdrop"
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
            class="ds-btn-compact"
            icon={<Icon name="sliders" />}
            text={t("settings.sections.hotkeys")}
            onClick={handleOpenCustomizer}
          />
          <Button
            class="primary ds-modal-done"
            text={t("common.close")}
            onClick={() => setOpen(false)}
          />
        </div>
      }
    >
      <div class="ds-cheatsheet-grid">
        <ShortcutColumn icon="book" title={t("settings.hotkeys.categories.reader")} defs={readerShortcuts} />
        <ShortcutColumn icon="compass" title={t("settings.hotkeys.categories.navigation")} defs={globalShortcuts} />
      </div>
    </Modal>
  );
}
