/**
 * Thin wrapper around `@solid-primitives/storage` `makePersisted`.
 *
 * Keeps the existing `persistedSignal(default, options)` call-site shape so
 * all 20+ consumers don't need to change.  The underlying implementation is
 * the well-tested primitives version — synchronous localStorage write inline
 * in the setter, quota-safe, no createEffect race.
 *
 * Migration note: the default serializer is now JSON.stringify/parse (same as
 * the primitives default).  All call-sites that store non-string primitives
 * (numbers, booleans, objects) are unaffected.  String-valued signals without
 * explicit serialize options will re-encode on first write post-migration
 * (harmless one-time preference reset for search/sort settings).
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
  if (options.deserialize) opts.deserialize = options.deserialize;
  return makePersisted(createSignal<T>(defaultValue), opts) as unknown as Signal<T>;
}
