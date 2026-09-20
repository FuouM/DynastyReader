/**
 * MangaDex@Home Client Reporting
 * Reports image retrieval results to https://api.mangadex.network/report
 * Mandatory for all non-mangadex.org CDN nodes.
 */

import * as ipc from "../../../ipc";
import { log } from "../../../utils/log";
import { MANGADEX_NETWORK_REPORT, MANGADEX_UPLOADS_BASE } from "./constants";
import type { MangaDexAtHomeReport } from "../types";

/**
 * Fires an asynchronous report of a MangaDex@Home image download outcome.
 * Skips reporting if the URL is served from MangaDex's own static CDN (uploads.mangadex.org).
 * Fire-and-forget: never throws or blocks the caller.
 */
export function reportAtHome(report: MangaDexAtHomeReport): void {
  // Never report requests to MangaDex's own central CDN
  if (report.url.startsWith(MANGADEX_UPLOADS_BASE)) {
    return;
  }

  void (async () => {
    try {
      await ipc.httpGet({
        url: MANGADEX_NETWORK_REPORT,
        method: "POST",
        body: JSON.stringify(report),
        contentType: "application/json",
        timeoutMs: 10000,
      });
    } catch (err) {
      // Non-critical background telemetry — log debug only
      log.debug("mangadex-report", "Failed reporting at-home delivery outcome:", err);
    }
  })();
}
