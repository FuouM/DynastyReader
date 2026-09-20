/**
 * Content Provider Store
 * Manages active provider mode ("dynasty" | "mangadex") and metadata.
 */

import { persistedSignal } from "../lib/persisted-signal";

export type ContentProvider = "dynasty" | "mangadex";

export interface ProviderMeta {
  id: ContentProvider;
  name: string;
  shortName: string;
  description: string;
  badge: string;
}

export const PROVIDERS: Record<ContentProvider, ProviderMeta> = {
  dynasty: {
    id: "dynasty",
    name: "Dynasty Scans",
    shortName: "Dynasty",
    description: "Curated Yuri & Girls' Love catalog, doujinshi, and scanlations.",
    badge: "Yuri / GL",
  },
  mangadex: {
    id: "mangadex",
    name: "MangaDex",
    shortName: "MangaDex",
    description: "Open community aggregator across all genres with multiple scanlation groups.",
    badge: "All Genres",
  },
};

export const [activeProvider, setActiveProviderRaw] = persistedSignal<ContentProvider>(
  "dynasty",
  { name: "ds-active-provider" },
);

export const isDynasty = () => activeProvider() === "dynasty";
export const isMangaDex = () => activeProvider() === "mangadex";
