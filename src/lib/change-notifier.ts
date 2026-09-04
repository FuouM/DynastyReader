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
  const target = new EventTarget();

  const getRevision = (): number => revision();

  const onChanged = (fn: ChangeListener): (() => void) => {
    target.addEventListener("change", fn);
    return () => target.removeEventListener("change", fn);
  };

  const notifyChanged = (): void => {
    setRevision((r) => r + 1);
    target.dispatchEvent(new Event("change"));
  };

  return { getRevision, onChanged, notifyChanged };
}
