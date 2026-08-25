/**
 * Typed wrapper around `makePersisted` from `@solid-primitives/storage`.
 *
 * The upstream `makePersisted<T, S>` has two required type parameters, and its
 * `PersistedState<S>` return type (an intersection `S & { 2: ... }`) can break
 * destructuring when `S` is not narrowed.  This helper locks `S = Signal<T>`,
 * so the return type is always `Signal<T>` — safe to destructure as
 * `[getter, setter]`.
 */
import { createSignal, type Signal } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";

export interface PersistedSignalOptions<T> {
  name?: string;
  serialize?: (data: T) => string;
  deserialize?: (data: string) => T;
  sync?: any;
}

/**
 * Creates a `createSignal` and persists it to storage in one call.
 * Returns a plain `Signal<T>` (destructured as `[getter, setter]`).
 */
export function persistedSignal<T>(
  defaultValue: T,
  options: PersistedSignalOptions<T>,
): Signal<T> {
  return makePersisted<T, Signal<T>>(
    createSignal<T>(defaultValue),
    options as any,
  ) as Signal<T>;
}
