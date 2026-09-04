/**
 * Thin wrapper around `@solid-primitives/storage` `makePersisted`.
 *
 * Keeps the existing `persistedSignal(default, options)` call-site shape so
 * all 20+ consumers don't need to change.  The underlying implementation is
 * the well-tested primitives version — synchronous localStorage write inline
 * in the setter, quota-safe, no createEffect race.
 *
 * Migration note: the default serializer is now JSON.stringify/parse (same as
 * the primitives default), wrapped in a legacy-tolerant deserialize that
 * returns the raw string for string-typed signals when JSON.parse fails
 * (plain-string values written by the pre-migration implementation).
 */
import { createSignal, type Signal } from "solid-js";
import { makePersisted, type PersistenceOptions } from "@solid-primitives/storage";

export interface PersistedSignalOptions<T> {
  name?: string;
  serialize?: (data: T) => string;
  deserialize?: (data: string) => T;
}

export function persistedSignal<T>(
  defaultValue: T,
  options: PersistedSignalOptions<T>,
): Signal<T> {
  const opts: PersistenceOptions<T, undefined> = {
    name: options.name,
    storage: localStorage,
  };
  if (options.serialize) opts.serialize = options.serialize;
  // Tolerate legacy plain-string values written before the makePersisted
  // migration (e.g. `ds_downloaded_sort_mode = name-asc` without JSON quotes).
  // Default JSON.parse would throw on those, crashing the component mount.
  opts.deserialize = options.deserialize ?? ((data: string): T => {
    try {
      return JSON.parse(data) as T;
    } catch {
      if (typeof defaultValue === "string") return data as unknown as T;
      return defaultValue;
    }
  });
  return makePersisted(createSignal<T>(defaultValue), opts) as unknown as Signal<T>;
}
