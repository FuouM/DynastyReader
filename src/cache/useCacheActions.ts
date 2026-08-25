import { browseCovers } from "../browse/browse-covers";
import { t } from "../i18n";
import { showBanner } from "../stores";
import {
  clearAllCacheStorage,
  clearAllCachedCovers,
  clearAllCachedPages,
  wipeDatabase,
} from "../db";

export function useCacheActions(refetch: () => void) {
  const withRefresh = async (action: () => Promise<void>, successKey: Parameters<typeof t>[0]) => {
    await action();
    try {
      browseCovers.clearMemoryCache();
    } catch {}
    showBanner(t(successKey));
    void refetch();
  };

  const purgeAll = () => withRefresh(() => clearAllCacheStorage(), "cache.clearAllSuccess");
  const purgePages = () => withRefresh(() => clearAllCachedPages(), "cache.clearPagesOnlySuccess");
  const purgeCovers = () => withRefresh(() => clearAllCachedCovers(), "cache.clearCoversOnlySuccess");
  const wipeDb = () => withRefresh(() => wipeDatabase(), "cache.dbWipeSuccess");

  return { purgeAll, purgePages, purgeCovers, wipeDb };
}
