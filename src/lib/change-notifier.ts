/**
 * Shared reactive revision counter and listener registry.
 * Deduplicates the listener/revision boilerplate across repositories.
 */

import { createSignal } from "solid-js";

export type ChangeListener = () => void;

export interface ChangeNotifier {
  getRevision: () => number;
  onChanged: (fn: ChangeListener) => () => void;
  notifyChanged: () => void;
}

export function createChangeNotifier(name = "change-notifier"): ChangeNotifier {
  const [revision, setRevision] = createSignal(0);
  const listeners: ChangeListener[] = [];

  const getRevision = (): number => revision();

  const onChanged = (fn: ChangeListener): (() => void) => {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  };

  const notifyChanged = (): void => {
    setRevision((r) => r + 1);
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch (err) {
        console.error(`[${name}] listener error:`, err);
      }
    }
  };

  return { getRevision, onChanged, notifyChanged };
}
