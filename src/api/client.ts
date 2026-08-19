/**
 * Barrel re-exporting the transport clients. `client.ts` is kept as the
 * canonical import path so existing `from "./client"` consumers stay stable;
 * the implementations live in `http.ts` (network) and `fs.ts` (filesystem).
 */

export { httpGetText, httpDownload, httpDownloadFull, cachedJson } from "./http";
export { fileResolve, fileExists, fileMove, fileDelete } from "./fs";