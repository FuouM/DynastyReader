/**
 * Content Provider Store
 * Manages active provider mode ("dynasty" | "mangadex") and metadata.
 */

import { persistedSignal } from "../lib/persisted-signal";
import { t } from "../i18n";
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
    get name() {
      return t("providers.dynasty.name");
    },
    get shortName() {
      return t("providers.dynasty.shortName");
    },
    get description() {
      return t("providers.dynasty.description");
    },
    get badge() {
      return t("providers.dynasty.badge");
    },
  },
  mangadex: {
    id: "mangadex",
    get name() {
      return t("providers.mangadex.name");
    },
    get shortName() {
      return t("providers.mangadex.shortName");
    },
    get description() {
      return t("providers.mangadex.description");
    },
    get badge() {
      return t("providers.mangadex.badge");
    },
  },
};

export const [activeProvider, setActiveProviderRaw] = persistedSignal<ContentProvider>(
  "dynasty",
  { name: "ds-active-provider" },
);

