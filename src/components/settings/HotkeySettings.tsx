import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import { t } from "../../i18n";
import { Icon, CloseIcon, AddIcon, RefreshIcon } from "../Icon";
import {
  HOTKEY_DEFINITIONS,
  HOTKEY_DEFINITIONS_MAP,
  type HotkeyActionId,
  type HotkeyDefinition,
  hotkeysMap,
  getHotkeys,
  addKeyToHotkey,
  removeKeyFromHotkey,
  resetHotkey,
  resetAllHotkeys,
  setIsRecordingHotkeys,
  eventToKeyCombo,
  formatKeyCombo,
  findConflict,
  type HotkeyConflict,
} from "../../hotkeys";

interface PendingConflict {
  combo: string;
  targetActionId: HotkeyActionId;
  conflict: HotkeyConflict;
}

export interface HotkeysSectionProps {
  active?: boolean;
}
export function HotkeysSection(props: HotkeysSectionProps) {
  const [search, setSearch] = createSignal("");
  const [recordingActionId, setRecordingActionId] = createSignal<HotkeyActionId | null>(null);
  const [pendingConflict, setPendingConflict] = createSignal<PendingConflict | null>(null);
  const [resetConfirm, setResetConfirm] = createSignal(false);

  const stopRecording = (): void => {
    setRecordingActionId(null);
    setPendingConflict(null);
    setIsRecordingHotkeys(false);
  };

  createEffect(() => {
    if (props.active === false) {
      stopRecording();
      setResetConfirm(false);
      setSearch("");
    }
  });

  // Global key capture when recording a key combination
  createEffect(() => {
    const actionId = recordingActionId();
    if (!actionId || props.active === false) {
      setIsRecordingHotkeys(false);
      return;
    }

    setIsRecordingHotkeys(true);

    const onKeyDown = (ev: KeyboardEvent): void => {
      // If resolving conflict banner, don't capture raw keys
      if (pendingConflict()) return;

      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        stopRecording();
        return;
      }

      // Ignore modifier-only keydowns
      if (["Control", "Alt", "Shift", "Meta"].includes(ev.key)) {
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();

      const combo = eventToKeyCombo(ev);
      if (!combo) return;

      // Check conflict against active map
      const scope = HOTKEY_DEFINITIONS_MAP[actionId]?.scope ?? "global";
      const conflict = findConflict(combo, actionId, scope, hotkeysMap());
      if (conflict) {
        setPendingConflict({ combo, targetActionId: actionId, conflict });
        return;
      }

      // No conflict -> apply
      addKeyToHotkey(actionId, combo);
      stopRecording();
    };

    makeEventListener(window, "keydown", onKeyDown, { capture: true });
  });

  const categories = createMemo(() => {
    const cats: string[] = [];
    for (const def of HOTKEY_DEFINITIONS) {
      if (!cats.includes(def.category)) {
        cats.push(def.category);
      }
    }
    return cats;
  });

  const filteredDefs = createMemo(() => {
    const q = search().toLowerCase().trim();
    if (!q) return HOTKEY_DEFINITIONS;
    return HOTKEY_DEFINITIONS.filter(
      (def) =>
        def.label.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        def.id.toLowerCase().includes(q) ||
        getHotkeys(def.id).some((k) => k.toLowerCase().includes(q)),
    );
  });

  const isDefault = (def: HotkeyDefinition): boolean => {
    const current = getHotkeys(def.id);
    if (current.length !== def.defaultKeys.length) return false;
    return def.defaultKeys.every((k) => current.includes(k));
  };

  const resolveConflict = (reassign: boolean): void => {
    const pending = pendingConflict();
    if (!pending) return;

    if (reassign) {
      removeKeyFromHotkey(pending.conflict.actionId, pending.combo);
      addKeyToHotkey(pending.targetActionId, pending.combo);
    }
    stopRecording();
  };

  return (
    <div style="display:flex;flex-direction:column;gap:10px;">
      {/* Sticky Filter & Reset Header */}
      <div
        style="display:flex;align-items:center;justify-content:space-between;gap:8px;position:sticky;top:0;background:var(--sys-window-bg,#ececec);z-index:10;padding:2px 0 6px 0;"
      >
        <div class="input-wrapper" style="flex:1;max-width:280px;">
          <input
            type="text"
            class="input-field has-clear"
            placeholder={t("settings.hotkeys.searchPlaceholder")}
            style="width:100%;box-sizing:border-box;font-size:11px;height:24px;"
            value={search()}
            onInput={(ev) => setSearch((ev.target as HTMLInputElement).value)}
            onKeyDown={(ev) => {
              if (ev.key === "Escape" && search()) {
                ev.stopPropagation();
                setSearch("");
              }
            }}
          />
          <Show when={search()}>
            <button
              type="button"
              class="input-clear-btn"
              tabIndex={-1}
              title={t("common.clear")}
              onClick={() => setSearch("")}
            >
              <CloseIcon />
            </button>
          </Show>
        </div>

        <div style="display:flex;align-items:center;gap:6px;">
          <Show
            when={resetConfirm()}
            fallback={
              <button
                type="button"
                class="win-button"
                style="font-size:11px;padding:2px 8px;display:inline-flex;align-items:center;gap:4px;"
                title="Reset all shortcuts to defaults"
                onClick={() => setResetConfirm(true)}
              >
                <RefreshIcon /> {t("settings.hotkeys.resetAllButton")}
              </button>
            }
          >
            <span style="font-size:11px;color:var(--sys-text-muted,#666);">Reset all?</span>
            <button
              type="button"
              class="win-button primary"
              style="font-size:10px;padding:1px 6px;height:20px;"
              onClick={() => {
                resetAllHotkeys();
                setResetConfirm(false);
              }}
            >
              Yes
            </button>
            <button
              type="button"
              class="win-button"
              style="font-size:10px;padding:1px 6px;height:20px;"
              onClick={() => setResetConfirm(false)}
            >
              No
            </button>
          </Show>
        </div>
      </div>

      {/* Conflict Resolution Banner */}
      <Show when={pendingConflict()}>
        {(pending) => {
          const existingDef = () => HOTKEY_DEFINITIONS_MAP[pending().conflict.actionId];
          const targetDef = () => HOTKEY_DEFINITIONS_MAP[pending().targetActionId];
          return (
            <div
              style="display:flex;flex-direction:column;gap:6px;padding:8px 10px;background:var(--ds-status-stale-bg,#fffbeb);border:1px solid var(--ds-status-stale-border,#fde68a);border-radius:3px;font-size:11px;color:var(--ds-status-stale-text,#92400e);"
            >
              <div style="display:flex;align-items:center;gap:6px;font-weight:600;">
                <Icon name="exclamation-triangle" /> Shortcut Conflict Detected
              </div>
              <div>
                The key combo <kbd class="ds-key-badge">{formatKeyCombo(pending().combo)}</kbd> is
                already bound to <strong>{existingDef()?.label ?? pending().conflict.actionId}</strong>.
              </div>
              <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:2px;">
                <button
                  type="button"
                  class="win-button"
                  style="font-size:10px;padding:2px 8px;"
                  onClick={() => resolveConflict(false)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  class="win-button primary"
                  style="font-size:10px;padding:2px 8px;"
                  onClick={() => resolveConflict(true)}
                >
                  Reassign to {targetDef()?.label ?? "New Action"}
                </button>
              </div>
            </div>
          );
        }}
      </Show>

      {/* Categorized Hotkeys Table */}
      <For each={categories()}>
        {(category) => {
          const items = () =>
            filteredDefs().filter((def) => def.category === category);

          return (
            <Show when={items().length > 0}>
              <div style="margin-top:4px;">
                <div
                  style="font-size:11px;font-weight:600;color:var(--sys-text-muted,#666);text-transform:uppercase;letter-spacing:0.5px;padding-bottom:4px;border-bottom:1px solid var(--sys-border-medium,#ccc);"
                >
                  {category}
                </div>
                <div class="ds-hotkeys-table">
                  <For each={items()}>
                    {(def) => {
                      const keys = () => getHotkeys(def.id);
                      const isRecordingThis = () => recordingActionId() === def.id;

                      return (
                        <div class="ds-hotkeys-row">
                          <div class="ds-hotkeys-info">
                            <div class="ds-hotkeys-label">{def.label}</div>
                            <div class="ds-hotkeys-desc">{def.description}</div>
                          </div>
                          <div class="ds-hotkeys-keys">
                            <Show
                              when={!isRecordingThis()}
                              fallback={
                                <div class="ds-key-recording">
                                  <span>Press keys...</span>
                                  <button
                                    type="button"
                                    class="win-button ds-btn-sm"
                                    style="font-size:9px;padding:0 4px;height:16px;line-height:1;"
                                    onClick={() => stopRecording()}
                                  >
                                    Cancel (Esc)
                                  </button>
                                </div>
                              }
                            >
                              <For each={keys()}>
                                {(keyCombo) => (
                                  <span class="ds-key-badge">
                                    <span>{formatKeyCombo(keyCombo)}</span>
                                    <Show when={keys().length > 1 || !isDefault(def)}>
                                      <span
                                        class="ds-key-badge-remove"
                                        title={t("common.delete")}
                                        onClick={() => removeKeyFromHotkey(def.id, keyCombo)}
                                      >
                                        ×
                                      </span>
                                    </Show>
                                  </span>
                                )}
                              </For>

                              <button
                                type="button"
                                class="win-button ds-btn-sm"
                                style="font-size:10px;padding:1px 5px;height:20px;"
                                title={t("settings.hotkeys.addKeyTooltip")}
                                onClick={() => {
                                  stopRecording();
                                  setRecordingActionId(def.id);
                                }}
                              >
                                <AddIcon />
                              </button>

                              <Show when={!isDefault(def)}>
                                <button
                                  type="button"
                                  class="win-button ds-btn-sm"
                                  style="font-size:10px;padding:1px 4px;height:20px;"
                                  title={t("settings.hotkeys.resetActionTooltip")}
                                  onClick={() => resetHotkey(def.id)}
                                >
                                  <RefreshIcon />
                                </button>
                              </Show>
                            </Show>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>
          );
        }}
      </For>

      <Show when={filteredDefs().length === 0}>
        <div
          class="ds-muted"
          style="text-align:center;padding:24px;font-size:12px;color:var(--sys-text-muted,#666);"
        >
          No shortcuts matched "{search()}".
        </div>
      </Show>
    </div>
  );
}

export const HotkeySettings = HotkeysSection;
