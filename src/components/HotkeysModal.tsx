/**
 * Hotkeys configuration modal dialog.
 * Lists all customizable hotkeys, lets users record new bindings,
 * detect/resolve conflicts, remove bindings, and reset to defaults.
 */

import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Modal } from "./Modal";
import { Icon, CloseIcon, AddIcon, RefreshIcon } from "./Icon";
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
} from "../hotkeys";

export interface HotkeysModalProps {
  open: boolean;
  onClose: () => void;
}

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

      const combo = eventToKeyCombo(ev);
      if (!combo) return; // Modifier key alone (Ctrl, Shift, Alt, etc.)

      ev.preventDefault();
      ev.stopPropagation();

      const def = HOTKEY_DEFINITIONS_MAP[actionId];
      if (!def) {
        stopRecording();
        return;
      }

      const conflict = findConflict(combo, actionId, def.scope, hotkeysMap());
      if (conflict) {
        setPendingConflict({
          combo,
          targetActionId: actionId,
          conflict,
        });
      } else {
        addKeyToHotkey(actionId, combo);
        stopRecording();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown, true);
      setIsRecordingHotkeys(false);
    });
  });

  const resolveConflictReassign = (): void => {
    const pc = pendingConflict();
    if (!pc) return;
    removeKeyFromHotkey(pc.conflict.actionId, pc.combo);
    addKeyToHotkey(pc.targetActionId, pc.combo);
    stopRecording();
  };

  const resolveConflictKeepBoth = (): void => {
    const pc = pendingConflict();
    if (!pc) return;
    addKeyToHotkey(pc.targetActionId, pc.combo);
    stopRecording();
  };

  const filteredDefs = createMemo(() => {
    const q = search().trim().toLowerCase();
    if (!q) return HOTKEY_DEFINITIONS;

    return HOTKEY_DEFINITIONS.filter((def) => {
      const keys = getHotkeys(def.id);
      const keysStr = keys.map((k) => formatKeyCombo(k).toLowerCase()).join(" ");
      return (
        def.label.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        def.category.toLowerCase().includes(q) ||
        keysStr.includes(q)
      );
    });
  });

  const categories = ["Reader Controls", "Navigation & App"] as const;

  const isDefault = (def: HotkeyDefinition): boolean => {
    const current = getHotkeys(def.id);
    if (current.length !== def.defaultKeys.length) return false;
    return def.defaultKeys.every((k, i) => current[i] === k);
  };

  return (
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
        Customize shortcuts for reader navigation, controls, and application actions.
      </div>

      {/* Search / Filter input and Reset button */}
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <div style="position:relative;flex:1;min-width:180px;">
          <input
            type="text"
            class="input-field"
            style="width:100%;height:26px;font-size:11px;padding-left:24px;box-sizing:border-box;"
            placeholder="Search shortcuts (e.g. Next page, Fullscreen, M, Alt+1)..."
            value={search()}
            onInput={(ev) => setSearch(ev.currentTarget.value)}
          />
          <span
            style="position:absolute;left:7px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--sys-text-muted,#888);pointer-events:none;"
          >
            <Icon name="search" />
          </span>
          <Show when={search().length > 0}>
            <CloseIcon
              style={{
                position: "absolute",
                right: "6px",
                top: "50%",
                transform: "translateY(-50%)",
                cursor: "pointer",
                "font-size": "12px",
                color: "var(--sys-text-muted,#888)",
              }}
              onClick={() => setSearch("")}
            />
          </Show>
        </div>
        <div style="flex-shrink:0;">
          <Show
            when={!resetConfirm()}
            fallback={
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:11px;color:var(--ds-danger-text,#a80000);font-weight:600;">
                  Reset all?
                </span>
                <button
                  type="button"
                  class="win-button ds-btn-sm"
                  style="color:var(--ds-danger-text,#a80000);font-weight:600;"
                  onClick={() => {
                    resetAllHotkeys();
                    setResetConfirm(false);
                  }}
                >
                  Yes, Reset
                </button>
                <button
                  type="button"
                  class="win-button ds-btn-sm"
                  onClick={() => setResetConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            }
          >
            <button
              type="button"
              class="win-button ds-btn-sm"
              title="Restore all hotkeys to default bindings"
              onClick={() => setResetConfirm(true)}
            >
              <RefreshIcon /> Reset Defaults
            </button>
          </Show>
        </div>
      </div>

      {/* Conflict Resolution Banner */}
      <Show when={pendingConflict() !== null}>
        <div
          class="ds-row"
          style="background:var(--ds-warn-bg,#fdf3f4);border:1px solid var(--ds-warn-border,#f5c2c7);padding:8px 10px;border-radius:3px;display:flex;flex-direction:column;gap:6px;"
        >
          <div style="font-size:11px;font-weight:600;color:var(--ds-warn-text,#842029);display:flex;align-items:center;gap:6px;">
            <Icon name="exclamation-triangle-fill" /> Shortcut Conflict Detected
          </div>
          <div style="font-size:11px;color:var(--sys-window-text,#333);">
            The key combination{" "}
            <span class="ds-key-badge">{formatKeyCombo(pendingConflict()!.combo)}</span> is already
            assigned to <strong>{pendingConflict()!.conflict.actionLabel}</strong> (
            {pendingConflict()!.conflict.category}).
          </div>
          <div style="display:flex;gap:6px;margin-top:2px;">
            <button
              type="button"
              class="win-button ds-btn-sm primary"
              onClick={() => resolveConflictReassign()}
            >
              Reassign to this action
            </button>
            <button
              type="button"
              class="win-button ds-btn-sm"
              onClick={() => resolveConflictKeepBoth()}
            >
              Assign both
            </button>
            <button
              type="button"
              class="win-button ds-btn-sm"
              onClick={() => stopRecording()}
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>

      {/* Shortcut Groups */}
      <For each={categories}>
        {(category) => {
          const items = createMemo(() =>
            filteredDefs().filter((d) => d.category === category)
          );

          return (
            <Show when={items().length > 0}>
              <div style="margin-top:4px;">
                <div style="font-size:11px;font-weight:600;color:var(--sys-window-text,#333);margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                  <Show
                    when={category === "Reader Controls"}
                    fallback={<Icon name="compass" />}
                  >
                    <Icon name="book" />
                  </Show>{" "}
                  {category}
                </div>
                <div class="ds-hotkeys-table">
                  <For each={items()}>
                    {(def) => {
                      const isRecording = () => recordingActionId() === def.id;
                      const keys = () => getHotkeys(def.id);

                      return (
                        <div class="ds-hotkeys-row">
                          <div class="ds-hotkeys-info">
                            <div class="ds-hotkeys-label">{def.label}</div>
                            <div class="ds-hotkeys-desc">{def.description}</div>
                          </div>
                          <div class="ds-hotkeys-keys">
                            <Show
                              when={!isRecording()}
                              fallback={
                                <div class="ds-key-recording">
                                  <Icon name="record-circle" /> Press key combo (Esc to cancel)...
                                </div>
                              }
                            >
                              <For each={keys()}>
                                {(k) => (
                                  <span class="ds-key-badge" title={k}>
                                    <span>{formatKeyCombo(k)}</span>
                                    <CloseIcon
                                      class="ds-key-badge-remove"
                                      title={`Remove ${formatKeyCombo(k)}`}
                                      onClick={() => removeKeyFromHotkey(def.id, k)}
                                    />
                                  </span>
                                )}
                              </For>
                              <Show when={keys().length === 0}>
                                <span
                                  class="ds-muted"
                                  style="font-size:10px;font-style:italic;margin-right:4px;"
                                >
                                  Unbound
                                </span>
                              </Show>
                              <button
                                type="button"
                                class="win-button ds-btn-sm"
                                title="Add keyboard shortcut"
                                style="padding:1px 6px;font-size:10px;height:20px;"
                                onClick={() => setRecordingActionId(def.id)}
                              >
                                <AddIcon /> Add
                              </button>
                              <Show when={!isDefault(def)}>
                                <button
                                  type="button"
                                  class="win-button ds-btn-sm"
                                  title="Reset to default shortcut"
                                  style="padding:1px 4px;font-size:10px;height:20px;"
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

export function HotkeysModal(props: HotkeysModalProps) {
  return (
    <Modal
      open={props.open}
      backdropId="ds-hotkeys-modal-backdrop"
      title={
        <>
          <Icon name="keyboard" /> Keyboard Shortcuts
        </>
      }
      width={560}
      onClose={props.onClose}
      footer={
        <div style="display:flex;justify-content:flex-end;width:100%;">
          <button
            type="button"
            class="win-button primary ds-modal-done"
            style="min-width:70px;"
            onClick={props.onClose}
          >
            Done
          </button>
        </div>
      }
    >
      <HotkeysSection active={props.open} />
    </Modal>
  );
}

