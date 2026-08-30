/**
 * Synchronously persisted SolidJS signal wrapper.
 * Directly binds signal updates to localStorage with zero unrooted effect race conditions.
 */
import { createSignal, type Signal, type Setter } from "solid-js";
import { log } from "../utils/log";

export interface PersistedSignalOptions<T> {
  name?: string;
  serialize?: (data: T) => string;
  deserialize?: (data: string) => T;
  sync?: boolean;
}

/**
 * Creates a `createSignal` and persists it directly to localStorage.
 * Returns a plain `Signal<T>` (destructured as `[getter, setter]`).
 */
export function persistedSignal<T>(
  defaultValue: T,
  options: PersistedSignalOptions<T>,
): Signal<T> {
  const key = options.name;
  const serialize = options.serialize ?? ((v: T) => {
    if (typeof v === "string") return v;
    if (typeof v === "boolean" || typeof v === "number") return String(v);
    return JSON.stringify(v);
  });
  const deserialize = options.deserialize ?? ((v: string) => {
    try {
      return JSON.parse(v);
    } catch (err) {
      log.debug("persisted-signal", "deserialize fallback, raw:", v, err);
      return v as unknown as T;
    }
  });

  let initial = defaultValue;
  if (key && typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        initial = deserialize(stored);
      }
    } catch (err) {
      log.warn("persisted-signal", `failed to read ${key}:`, err);
    }
  }

  const [signal, setSignal] = createSignal<T>(initial);

  const setPersisted: Setter<T> = ((value?: unknown) => {
    return setSignal((prev: T) => {
      const next = typeof value === "function" ? (value as (prev: T) => T)(prev) : (value as T);
      if (key && typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.setItem(key, serialize(next));
        } catch (err) {
          log.warn("persisted-signal", `failed to write ${key}:`, err);
        }
      }
      return next;
    });
  }) as unknown as Setter<T>;

  return [signal, setPersisted];
}
