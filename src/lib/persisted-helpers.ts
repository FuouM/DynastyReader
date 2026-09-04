import { createSignal } from "solid-js";
import { log } from "../utils/log";

/**
 * Bridges a module-level `persistedSignal` getter/setter pair into a
 * locally-reactive signal so SolidJS re-renders when the setting changes.
 * The returned setter writes through to the persisted setter *and* updates
 * the local mirror in one step — call-sites collapse from two setter calls
 * to one.
 */
export function usePersistedSetting<T>(getter: () => T, setter: (v: T) => void) {
  const [val, setVal] = createSignal(getter());
  const set = (next: T) => {
    setter(next);
    setVal(() => next);
  };
  return [val, set] as const;
}
/** Parse a value persisted via JSON.stringify-or-raw string (legacy quote-wrapped). */
export function parsePersistedString(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    if (parsed != null) return String(parsed);
  } catch (err) {
    log.debug("persisted", "deserialize fallback, raw:", raw, err);
  }
  return raw.replace(/^["']|["']$/g, "").trim() || fallback;
}

/** Parse a persisted string then normalize to lowercase id form (a-z0-9-). */
export function parsePersistedId(raw: string, fallback: string): string {
  return parsePersistedString(raw, fallback).trim().toLowerCase();
}
