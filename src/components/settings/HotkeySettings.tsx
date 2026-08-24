import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import { t } from "../../i18n";
import { Icon, AddIcon, RefreshIcon } from "../Icon";
import { InputField } from "../InputField";
import { IconText, Button } from "../Button";
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
    <div style="display:flex;flex-direction:column;gap:0;height:100%;">
      {/* Sticky Filter & Reset Header */}
      <div
        style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--sys-control-bg);z-index:10;padding:2px 0 6px 0;flex-shrink:0;"
      >
        <InputField
          wrapperStyle="flex:1;"
          placeholder={t("settings.hotkeys.searchPlaceholder")}
          value={search()}
          onInput={(val) => setSearch(val)}
          onEscape={() => { if (search()) { setSearch(""); } }}
        />

        <div style="display:flex;align-items:center;gap:6px;">
          <Show
            when={resetConfirm()}
            fallback={
              <Button
                cssText="font-size:11px;padding:2px 8px;display:inline-flex;align-items:center;gap:4px;"
                title={t("settings.hotkeys.resetAllTooltip")}
                icon={<RefreshIcon />}
                text={t("settings.hotkeys.resetAllButton")}
                onClick={() => setResetConfirm(true)}
              />
            }
          >
            <span class="ds-muted">{t("settings.hotkeys.resetConfirmPrompt")}</span>
            <Button
              className="primary"
              cssText="font-size:10px;padding:1px 6px;"
              text={t("common.yes")}
              onClick={() => {
                resetAllHotkeys();
                setResetConfirm(false);
              }}
            />
            <Button
              cssText="font-size:10px;padding:1px 6px;"
              text={t("common.no")}
              onClick={() => setResetConfirm(false)}
            />
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
                <IconText icon={<Icon name="exclamation-triangle" />}>{t("settings.hotkeys.conflictDetected")}</IconText>
              </div>
              <div>
                {t("settings.hotkeys.conflictMessage", {
                  combo: formatKeyCombo(pending().combo),
                  action: existingDef()?.label ?? pending().conflict.actionId,
                })}
              </div>
              <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:2px;">
                <Button
                  cssText="font-size:10px;padding:2px 8px;"
                  text={t("common.cancel")}
                  onClick={() => resolveConflict(false)}
                />
                <Button
                  className="primary"
                  cssText="font-size:10px;padding:2px 8px;"
                  text={t("settings.hotkeys.reassignButton", { action: targetDef()?.label ?? "New Action" })}
                  onClick={() => resolveConflict(true)}
                />
              </div>
            </div>
          );
        }}
      </Show>

      {/* Categorized Hotkeys Table */}
      <div style="flex:1;overflow-y:auto;min-height:0;">
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
                                  <span>{t("settings.hotkeys.pressKeys")}</span>
                                  <span class="ds-muted" style="color:inherit;opacity:0.7;">({t("settings.hotkeys.cancelEsc")})</span>
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

                              <Button
                                className="ds-btn-icon"
                                icon={<AddIcon />}
                                title={t("settings.hotkeys.addKeyTooltip")}
                                onClick={() => {
                                  stopRecording();
                                  setRecordingActionId(def.id);
                                }}
                              />

                              <Show when={!isDefault(def)}>
                                <Button
                                  className="ds-btn-icon"
                                  icon={<RefreshIcon />}
                                  title={t("settings.hotkeys.resetActionTooltip")}
                                  onClick={() => resetHotkey(def.id)}
                                />
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
          {t("settings.hotkeys.noMatches", { query: search() })}
        </div>
      </Show>
      </div>
    </div>
  );
}

export const HotkeySettings = HotkeysSection;
