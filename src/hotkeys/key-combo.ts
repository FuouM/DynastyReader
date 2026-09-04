import type { HotkeyActionId, HotkeyScope, CustomHotkeysMap } from "./types";
import { HOTKEY_DEFINITIONS_MAP } from "./registry";

/**
 * Standardize key names across browsers/platforms.
 */
function normalizeKeyName(key: string): string {
  if (!key) return "";
  if (key === " ") return "Space";
  if (key.length === 1) return key.toLowerCase();
  
  // Named keys
  const map: Record<string, string> = {
    esc: "Escape",
    spacebar: "Space",
    left: "ArrowLeft",
    right: "ArrowRight",
    up: "ArrowUp",
    down: "ArrowDown",
    del: "Delete",
    ins: "Insert",
  };

  const lower = key.toLowerCase();
  return map[lower] || key;
}

/**
 * Serializes a KeyboardEvent into a canonical key combo string.
 * Format: [Ctrl+][Alt+][Shift+][Meta+]Key
 * Examples: "Ctrl+Shift+f", "ArrowRight", "Space", "m", "Ctrl+="
 */
export function eventToKeyCombo(ev: KeyboardEvent): string | null {
  const key = ev.key;
  if (!key) return null;

  // Ignore bare modifier key presses
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) {
    return null;
  }

  const parts: string[] = [];
  if (ev.ctrlKey) parts.push("Ctrl");
  if (ev.altKey) parts.push("Alt");
  if (ev.shiftKey) parts.push("Shift");
  if (ev.metaKey) parts.push("Meta");

  const normalized = normalizeKeyName(key);
  parts.push(normalized);

  return parts.join("+");
}

/**
 * Parses and normalizes any stored key string into the canonical format.
 */
export function normalizeKeyCombo(combo: string): string {
  // A trailing "+" is the key itself, not a separator: "+", "Ctrl++".
  // Split it off first so the modifier scan below sees only real parts.
  const trimmed = combo.trim();
  const hasPlusKey =
    trimmed.endsWith("+") && (trimmed.length === 1 || trimmed[trimmed.length - 2] === "+");
  const body = hasPlusKey ? trimmed.slice(0, -1) : trimmed;
  const parts = body.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 && !hasPlusKey) return "";

  let ctrl = false;
  let alt = false;
  let shift = false;
  let meta = false;
  let mainKey = hasPlusKey ? "+" : "";
  for (const part of parts) {
    const pLower = part.toLowerCase();
    if (pLower === "ctrl" || pLower === "control") ctrl = true;
    else if (pLower === "alt") alt = true;
    else if (pLower === "shift") shift = true;
    else if (pLower === "meta" || pLower === "cmd" || pLower === "win") meta = true;
    else mainKey = part;
  }

  if (!mainKey && (ctrl || alt || shift || meta)) {
    return "";
  }

  const normalizedParts: string[] = [];
  if (ctrl) normalizedParts.push("Ctrl");
  if (alt) normalizedParts.push("Alt");
  if (shift) normalizedParts.push("Shift");
  if (meta) normalizedParts.push("Meta");
  normalizedParts.push(normalizeKeyName(mainKey));

  return normalizedParts.join("+");
}

/**
 * Compares a KeyboardEvent against a canonical key combo string.
 */
export function matchesEvent(ev: KeyboardEvent, combo: string): boolean {
  const normalizedCombo = normalizeKeyCombo(combo);
  if (!normalizedCombo) return false;

  const eventCombo = eventToKeyCombo(ev);
  if (!eventCombo) return false;

  return normalizedCombo.toLowerCase() === eventCombo.toLowerCase();
}

/**
 * Formats a key combo into a user-friendly UI string.
 * Example: "Ctrl+Shift+f" -> "Ctrl + Shift + F"
 *          "ArrowRight" -> "→ (Right Arrow)"
 */
export function formatKeyCombo(combo: string): string {
  const normalized = normalizeKeyCombo(combo);
  if (!normalized) return combo;

  const parts = normalized.split("+");
  const formattedParts = parts.map((part, index) => {
    // If it is the last part (the main key)
    if (index === parts.length - 1) {
      const keyMap: Record<string, string> = {
        ArrowRight: "→ Right Arrow",
        ArrowLeft: "← Left Arrow",
        ArrowUp: "↑ Up Arrow",
        ArrowDown: "↓ Down Arrow",
        Space: "Space",
        Escape: "Esc",
        Backspace: "Backspace",
        Enter: "Enter",
        Tab: "Tab",
        Delete: "Del",
        Insert: "Ins",
        Home: "Home",
        End: "End",
        PageUp: "PgUp",
        PageDown: "PgDn",
      };

      if (keyMap[part]) return keyMap[part];
      if (part.length === 1) return part.toUpperCase();
      return part;
    }
    return part;
  });

  return formattedParts.join(" + ");
}

export interface HotkeyConflict {
  actionId: HotkeyActionId;
  actionLabel: string;
  category: string;
  scope: HotkeyScope;
}

/**
 * Checks if a key combo is already assigned to another action in the same scope.
 */
export function findConflict(
  combo: string,
  currentActionId: HotkeyActionId,
  scope: HotkeyScope,
  hotkeysMap: CustomHotkeysMap
): HotkeyConflict | null {
  const norm = normalizeKeyCombo(combo).toLowerCase();
  if (!norm) return null;

  for (const [actionId, keys] of Object.entries(hotkeysMap) as [HotkeyActionId, string[]][]) {
    if (actionId === currentActionId) continue;
    const def = HOTKEY_DEFINITIONS_MAP[actionId];
    if (!def) continue;

    // Hotkeys with matching scope (or reader vs global overlapping)
    const hasSameKey = keys.some((k) => normalizeKeyCombo(k).toLowerCase() === norm);
    if (hasSameKey) {
      // Conflict if scopes match or if it could collide
      if (def.scope === scope || def.scope === "global" || scope === "global") {
        return {
          actionId,
          actionLabel: def.label,
          category: def.category,
          scope: def.scope,
        };
      }
    }
  }

  return null;
}
