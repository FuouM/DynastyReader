import { browseCovers } from "../browse/browse-covers";
import { t } from "../i18n";
import { showBanner } from "../stores/topbar";
import { formatBytes } from "../utils/formatting";
import { errorMessage } from "../utils/errors";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { log } from "../utils/log";
import { backupDatabase, restoreDatabaseFromPath, wipeDatabase } from "../db/db.manage";
import { clearAllCacheStorage, clearAllCachedCovers, clearAllCachedPages } from "../db/cache.repo";

export function useCacheActions(refetch: () => void) {
  const withRefresh = async (action: () => Promise<void>, successKey: Parameters<typeof t>[0]) => {
    await action();
    try {
      browseCovers.clearMemoryCache();
    } catch (e) {
      log.debug("cache-actions", "clearMemoryCache failed (non-fatal):", e);
    }
    showBanner(t(successKey));
    void refetch();
  };

  const purgeAll = () => withRefresh(() => clearAllCacheStorage(), "cache.clearAllSuccess");
  const purgePages = () => withRefresh(() => clearAllCachedPages(), "cache.clearPagesOnlySuccess");
  const purgeCovers = () => withRefresh(() => clearAllCachedCovers(), "cache.clearCoversOnlySuccess");
  const wipeDb = () => withRefresh(() => wipeDatabase(), "cache.dbWipeSuccess");

  const backupDb = async (): Promise<void> => {
    try {
      const res = await backupDatabase();
      showBanner(t("cache.dbBackupSuccess", { path: res.backup_path, size: formatBytes(res.size_bytes) }));
      void refetch();
    } catch (err) {
      showBanner(t("cache.dbBackupError", { msg: errorMessage(err) }));
    }
  };

  const restoreFromPicker = async (): Promise<void> => {
    try {
      let picked: string | string[] | null;
      try {
        picked = await openDialog({
          multiple: false,
          filters: [{ name: "Database", extensions: ["db"] }],
          title: t("cache.dbRestorePickerTitle"),
        });
      } catch (dlgErr) {
        log.error("cache-actions", "openDialog failed:", dlgErr);
        showBanner(t("cache.dbRestorePickerError", { msg: errorMessage(dlgErr) }));
        return;
      }
      if (!picked || Array.isArray(picked)) return;
      try {
        await restoreDatabaseFromPath(picked);
      } catch (e) {
        log.error("cache-actions", "restoreDatabaseFromPath failed:", e);
        throw e;
      }
      try {
        browseCovers.clearMemoryCache();
      } catch (e) {
        log.warn("cache-actions", "clearMemoryCache failed (non-fatal):", e);
      }
      showBanner(t("cache.dbRestoreSuccess", { path: picked as string }));
      void refetch();
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      const msg = errorMessage(err);
      log.error("cache-actions", "restoreFromPicker failed:", err);
      showBanner(t("cache.dbRestoreError", { msg }));
    }
  };

  return { purgeAll, purgePages, purgeCovers, wipeDb, backupDb, restoreFromPicker };
}
