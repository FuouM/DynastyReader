/**
 * Shared reactive revision counter for repositories: readers track
 * `getRevision()` in a resource source; writers call `notifyChanged()`.
 */

import { createSignal } from "solid-js";

export interface ChangeNotifier {
  getRevision: () => number;
  notifyChanged: () => void;
}

export function createChangeNotifier(): ChangeNotifier {
  const [revision, setRevision] = createSignal(0);
  return {
    getRevision: revision,
    notifyChanged: () => setRevision((r) => r + 1),
  };
}
