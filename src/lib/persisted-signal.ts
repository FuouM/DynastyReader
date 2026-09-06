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
import { parsePersistedString } from "./persisted-helpers";

export interface PersistedSignalOptions<T> {
  name?: string;
  serialize?: (data: T) => string;
  deserialize?: (data: string) => T;
}

export function persistedSignal<T>(
  defaultValue: T,
  options: PersistedSignalOptions<T>,
): Signal<T> {
  const isStringType = typeof defaultValue === "string";
  const opts: PersistenceOptions<T, undefined> = {
    name: options.name,
    storage: localStorage,
  };
  if (options.serialize) {
    opts.serialize = options.serialize;
  } else if (isStringType) {
    opts.serialize = (v: T) => (v != null ? String(v) : "");
  } else if (typeof defaultValue === "boolean" || typeof defaultValue === "number") {
    opts.serialize = (v: T) => String(v);
  }

  let initial = defaultValue;

  const customDeserialize = options.deserialize;
  opts.deserialize = (data: string): T => {
    const normalized = isStringType ? parsePersistedString(data, "") : data;
    let val: T;
    if (customDeserialize) {
      try {
        val = customDeserialize(normalized);
      } catch (err) {
        console.warn(
          `[persistedSignal] custom deserialize failed for key "${options.name}":`,
          data,
          err,
        );
        val = defaultValue;
      }
    } else {
      try {
        val = JSON.parse(data) as T;
      } catch (err) {
        if (isStringType) {
          val = normalized as unknown as T;
        } else {
          if (options.name && typeof localStorage !== "undefined") {
            console.warn(
              `[persistedSignal] failed deserializing key "${options.name}", evicting corrupt value:`,
              data,
              err,
            );
            try {
              localStorage.removeItem(options.name);
            } catch {}
          }
          val = defaultValue;
        }
      }
    }

    // Heal legacy storage: if the stored value is in a legacy format
    // (e.g. JSON-quoted string '"paged"' instead of clean 'paged'), write back
    // the canonical format immediately so localStorage stays clean.
    if (options.name && typeof localStorage !== "undefined") {
      try {
        const canonical = opts.serialize ? opts.serialize(val) : (isStringType ? String(val ?? "") : JSON.stringify(val));
        if (canonical != null && canonical !== data) {
          localStorage.setItem(options.name, canonical);
        }
      } catch {}
    }

    return val;
  };
  return makePersisted(createSignal<T>(initial), opts) as unknown as Signal<T>;
}
