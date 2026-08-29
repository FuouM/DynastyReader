import { createSignal } from "solid-js";
import { persistedSignal } from "../lib/persisted-signal";
import type { HotkeyActionId, CustomHotkeysMap } from "./types";
import { HOTKEY_DEFINITIONS, getDefaultHotkeys, HOTKEY_DEFINITIONS_MAP } from "./registry";
import { matchesEvent, normalizeKeyCombo } from "./key-combo";

const [hotkeysSignal, setHotkeysSignal] = persistedSignal<CustomHotkeysMap>(getDefaultHotkeys(), {
  name: "ds-custom-hotkeys",
  serialize: JSON.stringify,
  deserialize: (raw) => {
    if (!raw) return getDefaultHotkeys();
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return getDefaultHotkeys();
      const merged: Partial<CustomHotkeysMap> = { ...getDefaultHotkeys() };
      for (const def of HOTKEY_DEFINITIONS) {
        if (Array.isArray(parsed[def.id])) {
          merged[def.id] = parsed[def.id].map(normalizeKeyCombo).filter(Boolean);
        }
      }
      return merged as CustomHotkeysMap;
    } catch (err) {
      console.debug("[dynasty-reader/hotkeys-store] deserialize failed:", err);
      return getDefaultHotkeys();
    }
  },
});

export const hotkeysMap = hotkeysSignal;
export const setHotkeysMap = (val: CustomHotkeysMap | ((prev: CustomHotkeysMap) => CustomHotkeysMap)) => {
  setHotkeysSignal(val);
};
export const [isRecordingHotkeys, setIsRecordingHotkeys] = createSignal<boolean>(false);

export function getHotkeys(id: HotkeyActionId): string[] {
  return hotkeysMap()[id] ?? HOTKEY_DEFINITIONS_MAP[id]?.defaultKeys ?? [];
}

export function setHotkeys(id: HotkeyActionId, keys: string[]): void {
  const cleanKeys = Array.from(new Set(keys.map(normalizeKeyCombo).filter(Boolean)));
  setHotkeysMap((prev: CustomHotkeysMap) => ({ ...prev, [id]: cleanKeys }));
}

export function addKeyToHotkey(id: HotkeyActionId, key: string): void {
  const current = getHotkeys(id);
  const normalized = normalizeKeyCombo(key);
  if (!normalized || current.includes(normalized)) return;
  setHotkeys(id, [...current, normalized]);
}

export function removeKeyFromHotkey(id: HotkeyActionId, key: string): void {
  const current = getHotkeys(id);
  const normalized = normalizeKeyCombo(key);
  setHotkeys(id, current.filter((k) => k !== normalized));
}

export function resetHotkey(id: HotkeyActionId): void {
  const def = HOTKEY_DEFINITIONS_MAP[id];
  if (!def) return;
  setHotkeys(id, [...def.defaultKeys]);
}

export function resetAllHotkeys(): void {
  const defaults = getDefaultHotkeys();
  setHotkeysMap(defaults);
}

/**
 * Checks if a keyboard event matches any configured key for the specified action ID.
 */
export function matchesHotkey(ev: KeyboardEvent, id: HotkeyActionId): boolean {
  if (isRecordingHotkeys()) return false;
  const keys = getHotkeys(id);
  return keys.some((keyCombo) => matchesEvent(ev, keyCombo));
}

/**
 * Helper to check whether an active element or event target is an interactive text input.
 */
export function isTextInputTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
