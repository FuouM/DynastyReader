/**
 * Shared reactive revision counter and imperative listener registry.
 * Deduplicates the listener/revision boilerplate across repositories.
 *
 * Listener dispatch uses a plain EventTarget — platform-native, zero deps,
 * guaranteed memory semantics (GC-safe removal via the returned unsub fn).
 */

import { createSignal } from "solid-js";

export type ChangeListener = () => void;

export interface ChangeNotifier {
  getRevision: () => number;
  onChanged: (fn: ChangeListener) => () => void;
  notifyChanged: () => void;
}

export function createChangeNotifier(_name = "change-notifier"): ChangeNotifier {
  const [revision, setRevision] = createSignal(0);
  const listeners = new Set<ChangeListener>();

  const getRevision = (): number => revision();

  const onChanged = (fn: ChangeListener): (() => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  const notifyChanged = (): void => {
    setRevision((r) => r + 1);
    for (const fn of listeners) {
      fn();
    }
  };

  return { getRevision, onChanged, notifyChanged };
}
