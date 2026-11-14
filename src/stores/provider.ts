/**
 * Content Provider Store
 * Manages the active provider mode ("dynasty" | "mangadex").
 * Provider metadata lives on each provider's `meta` (src/providers).
 */

import { persistedSignal } from "../lib/persisted-signal";
export type ContentProvider = "dynasty" | "mangadex";

export const [activeProvider, setActiveProviderRaw] = persistedSignal<ContentProvider>(
  "dynasty",
  { name: "ds-active-provider" },
);
