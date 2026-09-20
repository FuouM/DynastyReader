// Web Mock Bridge for Tauri v2 IPC
(() => {
  if (typeof window === "undefined") return;
  if (window.__TAURI_MOCK_INITIALIZED__ && window.__TAURI_INTERNALS__) return;
  window.__TAURI_MOCK_INITIALIZED__ = true;
  window.__TAURI_IS_MOCK__ = true;
  console.log("[MockBridge] Initialized successfully");

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

      // Database
      if (cmd === "dbExecute" || cmd === "dbExecuteBatch") {
        return { rows_affected: 0, last_insert_rowid: 1 };
      }
      if (cmd === "dbQuery") {
        const sql = (args.sql || "").trim().toUpperCase();
        // Aggregates for CacheView and Count queries
        if (sql.includes("COUNT(*)")) {
          return {
            rows: [
              {
                c: 0,
                count: 0,
                pages: 0,
                chapters: 0,
                total_bytes: 0,
                chapter_permalink: "",
                last_cached: Date.now(),
              },
            ],
          };
        }
        // Return empty rows for all queries by default
        return { rows: [] };
      }

      // HTTP
      if (cmd === "httpGet") {
        const url = (args && args.url) || "";
        if (url.includes("/series/")) {
          return {
            status: 200,
            body: JSON.stringify({
              name: "Hana ni Arashi",
              type: "Series",
              permalink: "hana-ni-arashi",
              description: "Nanoha and Chidori are dating in secret.",
              cover: "/mock-cover.jpg",
              aliases: [],
              tags: [
                { type: "Author", name: "Kobachi Ruka", permalink: "kobachi-ruka" },
                { type: "Genre", name: "Romance", permalink: "romance" },
              ],
              taggings: [
                { title: "Chapter 1: The Secret", permalink: "hana-ni-arashi-ch01", released_on: "2024-01-01" },
                { title: "Chapter 2: Rooftop Lunch", permalink: "hana-ni-arashi-ch02", released_on: "2024-01-08" },
              ],
            }),
            etag: "mock-etag",
          };
        }
        if (url.includes("/chapters/")) {
          return {
            status: 200,
            body: JSON.stringify({
              title: "Chapter 1: The Secret",
              permalink: "hana-ni-arashi-ch01",
              pages: [
                { url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1200'><rect fill='%23ccc' width='100%' height='100%'/></svg>", name: "01.svg" },
                { url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1200'><rect fill='%23aaa' width='100%' height='100%'/></svg>", name: "02.svg" },
              ],
            }),
            etag: "mock-etag-ch",
          };
        }
        return { status: 200, body: "[]", etag: "" };
      }
      if (cmd === "httpDownload") {
        return { written_to: args.outputPath || "", size_bytes: 0, absolute_path: "" };
      }

      // File operations
      if (cmd === "fileExists") return { exists: false };
      if (cmd === "fileExistsBatch") return { results: [] };
      if (cmd === "dirStat") return { file_count: 0, total_bytes: 0 };
      if (cmd === "dirStatBatch") return { results: [] };
      if (cmd === "fileMove" || cmd === "fileDeleteBatch") return 0;
      if (cmd === "verifyFileIntegrityBatch") return [];

      // Download queue
      if (cmd === "getDownloadQueue") {
        return { items: [], paused: false };
      }
      if (cmd === "pauseDownloads" || cmd === "resumeDownloads" || cmd === "cancelDownload") {
        return null;
      }
      if (cmd === "enqueueChapters") {
        return { enqueued: 0, skipped: 0 };
      }

      // Local import
      if (cmd === "scanFolder" || cmd === "scanArchive") {
        return { chapters: [], series_name: "Mock Series", valid: true };
      }

      // Updates
      if (cmd === "checkForUpdates") {
        return { has_update: false, current_version: "0.5.0", latest_version: "0.5.0" };
      }

      console.warn("[MockBridge] Unhandled invoke cmd:", cmd, args);
      return null;
    },
    transformCallback: (callback, once = false) => {
      const id = nextListenerId++;
      window[`_${id}`] = (res) => {
        if (once) delete window[`_${id}`];
        return callback(res);
      };
      return id;
    },
    convertFileSrc: (filePath) => filePath || "",
  };
})();
