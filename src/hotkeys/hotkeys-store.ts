import { createSignal } from "solid-js";
import type { HotkeyActionId, CustomHotkeysMap } from "./types";
import { HOTKEY_DEFINITIONS, getDefaultHotkeys, HOTKEY_DEFINITIONS_MAP } from "./registry";
import { matchesEvent, normalizeKeyCombo } from "./key-combo";
const STORAGE_KEY = "ds-custom-hotkeys";

function deserializeHotkeys(raw: string | null): CustomHotkeysMap {
  const defaults = getDefaultHotkeys();
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaults;

    const merged: Partial<CustomHotkeysMap> = { ...defaults };
    for (const def of HOTKEY_DEFINITIONS) {
      if (Array.isArray(parsed[def.id])) {
        merged[def.id] = parsed[def.id].map(normalizeKeyCombo).filter(Boolean);
      }
    }
    return merged as CustomHotkeysMap;
  } catch (err) {
    console.error("Failed to load custom hotkeys from localStorage:", err);
    return defaults;
  }
}

function readPersistedHotkeys(): CustomHotkeysMap {
  if (typeof localStorage === "undefined") return getDefaultHotkeys();
  try {
    return deserializeHotkeys(localStorage.getItem(STORAGE_KEY));
  } catch {
    return getDefaultHotkeys();
  }
}

const [hotkeysSignal, setHotkeysSignal] = createSignal<CustomHotkeysMap>(readPersistedHotkeys());

export const hotkeysMap = hotkeysSignal;
export const setHotkeysMap = (val: CustomHotkeysMap | ((prev: CustomHotkeysMap) => CustomHotkeysMap)) => {
  const next = typeof val === "function" ? val(hotkeysSignal()) : val;
  setHotkeysSignal(next);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch (err) {
    console.error("[hotkeys] failed saving hotkeys to localStorage:", err);
  }
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
