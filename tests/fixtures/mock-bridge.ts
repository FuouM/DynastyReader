/**
 * Mock bridge code generator for driving Tauri IPC inside headless browser tabs.
 */

import {
  MOCK_SERIES,
  MOCK_FOLLOWED_SERIES,
  MOCK_READING_PROGRESS,
  MOCK_READING_HISTORY,
  MOCK_BOOKMARKS,
  MOCK_DOWNLOAD_QUEUE,
  MOCK_LOCAL_SERIES,
  MOCK_BLACKLIST,
} from "./mock-data";

export function getMockBridgeCode(): string {
  return `
(() => {
  if (typeof window === "undefined") return;
  if (window.__TAURI_INTERNALS__ && !window.__TAURI_IS_MOCK__) return;

  window.__TAURI_MOCK_INITIALIZED__ = true;
  window.__TAURI_IS_MOCK__ = true;

  const MOCK_SERIES = ${JSON.stringify(MOCK_SERIES)};
  const MOCK_FOLLOWED_SERIES = ${JSON.stringify(MOCK_FOLLOWED_SERIES)};
  const MOCK_READING_PROGRESS = ${JSON.stringify(MOCK_READING_PROGRESS)};
  const MOCK_READING_HISTORY = ${JSON.stringify(MOCK_READING_HISTORY)};
  const MOCK_BOOKMARKS = ${JSON.stringify(MOCK_BOOKMARKS)};
  const MOCK_DOWNLOAD_QUEUE = ${JSON.stringify(MOCK_DOWNLOAD_QUEUE)};
  const MOCK_LOCAL_SERIES = ${JSON.stringify(MOCK_LOCAL_SERIES)};
  const MOCK_BLACKLIST = ${JSON.stringify(MOCK_BLACKLIST)};

  const listeners = new Map();
  let nextListenerId = 1;

  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args = {}) => {
      // Plugin handlers
      if (cmd.startsWith("plugin:window-state")) return null;
      if (cmd.startsWith("plugin:log")) return null;
      if (cmd === "plugin:event|listen") {
        const id = nextListenerId++;
        if (args && args.event) {
          if (!listeners.has(args.event)) listeners.set(args.event, new Set());
          listeners.get(args.event).add(args.handler);
        }
        return id;
      }
      if (cmd === "plugin:event|unlisten") return null;

      // Database execution
      if (cmd === "dbExecute" || cmd === "dbExecuteBatch") {
        return { rows_affected: 1, last_insert_rowid: 1 };
      }

      // Database queries
      if (cmd === "dbQuery") {
        const sql = (args.sql || "").trim().toUpperCase();

        if (sql.includes("COUNT(*)")) {
          let count = 2;
          if (sql.includes("FROM FOLLOWED_SERIES") || sql.includes("FROM FOLLOWED_MANGA")) count = 5;
          else if (sql.includes("FROM COLLECTIONS")) count = 3;
          else if (sql.includes("FROM BOOKMARKS")) count = 8;
          else if (sql.includes("FROM READING_HISTORY")) count = 14;
          else if (sql.includes("FROM LOCAL_SERIES")) count = 2;
          return {
            rows: [
              {
                c: count,
                count: count,
                pages: 42,
                chapters: 3,
                total_bytes: 10485760,
                chapter_permalink: "hana-ni-arashi-ch01",
                last_cached: Date.now() - 3600000,
              },
            ],
          };
        }

        if (sql.includes("FROM FOLLOWED_SERIES")) return { rows: MOCK_FOLLOWED_SERIES };
        if (sql.includes("FROM FOLLOWED_MANGA")) {
          return {
            rows: MOCK_FOLLOWED_SERIES.map((s) => ({
              manga_id: s.permalink,
              title: s.name,
              cover_filename: s.cover,
              last_checked_at: s.last_checked_at,
              latest_chapter_id: s.latest_chapter_permalink,
              latest_chapter_title: s.latest_chapter_title,
              created_at: s.created_at,
            })),
          };
        }
        if (sql.includes("FROM READING_PROGRESS")) return { rows: MOCK_READING_PROGRESS };
        if (sql.includes("FROM READING_HISTORY")) return { rows: MOCK_READING_HISTORY };
        if (sql.includes("FROM BOOKMARKS")) return { rows: MOCK_BOOKMARKS };
        if (sql.includes("FROM LOCAL_SERIES")) return { rows: MOCK_LOCAL_SERIES };
        if (sql.includes("FROM SERIES_BLACKLIST")) return { rows: MOCK_BLACKLIST.series };
        if (sql.includes("FROM TAG_BLACKLIST")) return { rows: MOCK_BLACKLIST.tags };
        if (sql.includes("FROM CACHED_PAGES")) {
          if (sql.includes("GROUP BY")) {
            return {
              rows: [
                { chapter_id: "ch-uuid-1a", chapter_permalink: "mdx:ch-uuid-1a", manga_id: "6bae5c8c-d5ff-43df-acf7-b7670532c8b1", manga_title: "Yoku Wakaranai keredo Isekai ni Tensei Shiteita You Desu", chapter_title: "Ch. 1 - The Rebirth", page_count: 20, size_bytes: 5242880, total_bytes: 5242880, last_cached: Date.now() - 3600000, last_cached_at: Date.now() - 3600000 },
                { chapter_id: "ch-uuid-2a", chapter_permalink: "mdx:ch-uuid-2a", manga_id: "6bae5c8c-d5ff-43df-acf7-b7670532c8b1", manga_title: "Yoku Wakaranai keredo Isekai ni Tensei Shiteita You Desu", chapter_title: "Ch. 2 - Magic Discovery", page_count: 22, size_bytes: 5242880, total_bytes: 5242880, last_cached: Date.now() - 7200000, last_cached_at: Date.now() - 7200000 },
                { chapter_id: "orphan-ch01", chapter_permalink: "mdx:orphan-ch01", manga_id: "", manga_title: "Orphan Manga", chapter_title: "Oneshot", page_count: 15, size_bytes: 3145728, total_bytes: 3145728, last_cached: Date.now() - 10800000, last_cached_at: Date.now() - 10800000 },
              ],
            };
          }
          return {
            rows: [
              { chapter_permalink: "hana-ni-arashi-ch01", page_index: 0, file_path: "/cached/1.jpg", size_bytes: 250000, cached_at: Date.now() },
              { chapter_permalink: "hana-ni-arashi-ch01", page_index: 1, file_path: "/cached/2.jpg", size_bytes: 260000, cached_at: Date.now() },
            ],
          };
        }

        return { rows: [] };
      }

      // HTTP endpoints
      if (cmd === "httpGet") {
        const url = args.url || "";
        if (url.includes("hana-ni-arashi")) {
          if (url.includes("/chapters/")) {
            return {
              status: 200,
              body: JSON.stringify({
                title: "Chapter 1: The Secret",
                pages: [
                  { url: "/page1.jpg", name: "01.jpg" },
                  { url: "/page2.jpg", name: "02.jpg" },
                ],
              }),
              etag: "mock-etag-ch",
            };
          }
          return { status: 200, body: JSON.stringify(MOCK_SERIES), etag: "mock-etag" };
        }

        try {
          const res = await fetch("http://localhost:1422", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(args),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.status === 200 || data.status === 304) return data;
          }
        } catch {}
        let host = "";
        try {
          host = new URL(url).hostname.toLowerCase();
        } catch {}
        if (host === "api.mangadex.org" || host.endsWith(".mangadex.org")) {
          if (url.includes("/at-home/server/")) {
            return {
              status: 200,
              body: JSON.stringify({
                result: "ok",
                baseUrl: "https://uploads.mangadex.org",
                chapter: { hash: "mockhash123", data: ["1.jpg", "2.jpg"], dataSaver: ["1.jpg", "2.jpg"] },
              }),
            };
          }
          if (url.includes("/chapter/")) {
            return {
              status: 200,
              body: JSON.stringify({
                result: "ok",
                response: "entity",
                data: {
                  id: "ch-uuid-1a",
                  type: "chapter",
                  attributes: { volume: "1", chapter: "1", title: "The Rebirth", translatedLanguage: "en", readableAt: "2024-01-01T00:00:00+00:00", pages: 2 },
                  relationships: [{ id: "6bae5c8c-d5ff-43df-acf7-b7670532c8b1", type: "manga", attributes: { title: { en: "Yoku Wakaranai keredo Isekai ni Tensei Shiteita You Desu" } } }],
                },
              }),
            };
          }
          if (url.includes("/chapter?") || url.endsWith("/chapter")) {
            return {
              status: 200,
              body: JSON.stringify({
                result: "ok",
                response: "collection",
                data: [
                  {
                    id: "ch-uuid-1a",
                    type: "chapter",
                    attributes: { volume: "1", chapter: "1", title: "The Rebirth", translatedLanguage: "en", readableAt: "2024-01-01T00:00:00+00:00", pages: 20 },
                    relationships: [{ id: "6bae5c8c-d5ff-43df-acf7-b7670532c8b1", type: "manga", attributes: { title: { en: "Yoku Wakaranai keredo Isekai ni Tensei Shiteita You Desu" } } }],
                  },
                ],
                total: 1,
                limit: 24,
                offset: 0,
              }),
            };
          }
          if (url.includes("/manga/")) {
            return {
              status: 200,
              body: JSON.stringify({
                result: "ok",
                response: "entity",
                data: {
                  id: "6bae5c8c-d5ff-43df-acf7-b7670532c8b1",
                  type: "manga",
                  attributes: {
                    title: { en: "Yoku Wakaranai keredo Isekai ni Tensei Shiteita You Desu" },
                    description: { en: "I don't really get it, but it looks like I was reincarnated in another world." },
                    status: "ongoing",
                    tags: [],
                  },
                  relationships: [],
                },
              }),
            };
          }
        }
        if (url.includes("/series/")) {
          return { status: 200, body: JSON.stringify(MOCK_SERIES), etag: "mock-etag" };
        }
        if (url.includes("/chapters/")) {
          return {
            status: 200,
            body: JSON.stringify({
              title: "Chapter 1: The Secret",
              pages: [
                { url: "/page1.jpg", name: "01.jpg" },
                { url: "/page2.jpg", name: "02.jpg" },
              ],
            }),
            etag: "mock-etag-ch",
          };
        }
        return { status: 200, body: "[]", etag: "" };
      }

      if (cmd === "httpDownload") {
        try {
          const res = await fetch("http://localhost:1422/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(args),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.absolute_path) return data;
          }
        } catch {}
        return { written_to: args.outputPath || "", size_bytes: 102400, absolute_path: args.outputPath || "" };
      }

      // Download queue
      if (cmd === "getDownloadQueue") {
        return { items: MOCK_DOWNLOAD_QUEUE, paused: false };
      }
      if (cmd === "pauseDownloads" || cmd === "resumeDownloads" || cmd === "cancelDownload") {
        return null;
      }
      if (cmd === "enqueueChapters") {
        return { enqueued: 1, skipped: 0 };
      }

      // File system
      if (cmd === "dirStat") return { file_count: 42, total_bytes: 52428800 };
      if (cmd === "dirStatBatch") return { results: [{ file_count: 42, total_bytes: 52428800 }] };
      if (cmd === "fileExists") return { exists: false, absolute_path: "", size_bytes: 0 };
      if (cmd === "fileExistsBatch") return { results: [{ path: args.paths?.[0] || "", exists: true }] };
      if (cmd === "fileMove" || cmd === "fileDeleteBatch") return 0;
      if (cmd === "verifyFileIntegrityBatch") return [];

      // Local import
      if (cmd === "scanFolder" || cmd === "scanArchive") {
        return {
          chapters: [
            { name: "Chapter 1", path: "ch01", pages: 20 },
            { name: "Chapter 2", path: "ch02", pages: 22 },
          ],
          series_name: "My Local Manga",
          valid: true,
        };
      }

      if (cmd === "checkForUpdates") return null;

      console.warn("[MockBridge] Handled with default empty:", cmd);
      return null;
    },
    transformCallback: (callback, once = false) => {
      const id = nextListenerId++;
      window["_" + id] = (res) => {
        if (once) delete window["_" + id];
        return callback(res);
      };
      return id;
    },
    convertFileSrc: (filePath) => filePath || "",
  };
})();
`;
}
