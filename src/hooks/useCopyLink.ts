/**
 * Shared clipboard copy hook: copies a URL to clipboard with
 * optional banner feedback and consistent error logging.
 * Extracted from `ReaderToolbar.tsx` / `FeedItemRow.tsx` for modularity.
 */

import { createSignal } from "solid-js";
import { debounce } from "@solid-primitives/scheduled";
import { showBanner } from "../stores";
import { errorMessage } from "../utils/errors";
import { t } from "../i18n";
import { log } from "../utils/log";

interface UseCopyLinkOpts {
  /** Reactive accessor that returns the URL to copy. */
  getUrl: () => string;
  /** Namespace for error logging (e.g. "reader-toolbar"). */
  namespace?: string;
  /** Whether to show banner notifications (default: true). */
  showBanners?: boolean;
}

export function useCopyLink(opts: UseCopyLinkOpts) {
  const namespace = opts.namespace ?? "use-copy-link";
  const showBanners = opts.showBanners ?? true;

  const [copied, setCopied] = createSignal(false);
  const resetCopied = debounce(() => setCopied(false), 2000);

  const handleCopyLink = async (ev?: MouseEvent): Promise<void> => {
    ev?.stopPropagation();
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(opts.getUrl());
        setCopied(true);
        if (showBanners) {
          showBanner(t("reader.toolbar.copiedLinkBanner"));
        }
        resetCopied();
      }
    } catch (err) {
      log.warn(namespace, "copy link failed:", err);
      if (showBanners) {
        const msg = errorMessage(err);
        showBanner(t("reader.toolbar.copyLinkErrorBanner", { msg }));
      }
    }
  };

  return { copied, handleCopyLink };
}
