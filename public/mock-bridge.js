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
        if (sql.includes("FROM CACHED_PAGES")) {
          if (sql.includes("GROUP BY")) {
            return {
              rows: [
                { chapter_permalink: "hana-ni-arashi-ch01", page_count: 20, size_bytes: 5242880, last_cached: Date.now() - 3600000 },
                { chapter_permalink: "hana-ni-arashi-ch02", page_count: 22, size_bytes: 5242880, last_cached: Date.now() - 7200000 },
                { chapter_permalink: "orphan-ch01", page_count: 15, size_bytes: 3145728, last_cached: Date.now() - 10800000 },
              ],
            };
          }
          return {
            rows: [
              { chapter_permalink: "hana-ni-arashi-ch01", page_index: 0, file_path: "/cached/1.jpg", size_bytes: 250000, cached_at: Date.now() },
            ],
          };
        }
        // Aggregates for CacheView and Count queries
        if (sql.includes("COUNT(*)")) {
          return {
            rows: [
              {
                c: 2,
                count: 2,
                pages: 42,
                chapters: 3,
                total_bytes: 10485760,
                chapter_permalink: "hana-ni-arashi-ch01",
                last_cached: Date.now() - 3600000,
              },
            ],
          };
        }
        if (sql.includes("FROM CACHED_METADATA")) {
          const makePages = (num) => Array.from({ length: num }, (_, i) => ({
            name: `0${i + 1}.svg`,
            url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1200' viewBox='0 0 800 1200'><rect fill='%233b82f6' width='100%' height='100%'/><text x='400' y='600' font-size='64' font-family='sans-serif' text-anchor='middle' fill='%23ffffff'>Page ${i + 1}</text></svg>`
          }));
          return {
            rows: [
              {
                cache_key: "chapter:hana-ni-arashi-ch01",
                json_payload: JSON.stringify({
                  title: "Chapter 1: The Secret",
                  permalink: "hana-ni-arashi-ch01",
                  pages: makePages(5),
                  tags: [{ type: "Series", name: "Hana ni Arashi", permalink: "hana-ni-arashi" }],
                }),
              },
              {
                cache_key: "chapter:hana-ni-arashi-ch02",
                json_payload: JSON.stringify({
                  title: "Chapter 2: Rooftop Lunch",
                  permalink: "hana-ni-arashi-ch02",
                  pages: makePages(5),
                  tags: [{ type: "Series", name: "Hana ni Arashi", permalink: "hana-ni-arashi" }],
                }),
              },
              {
                cache_key: "chapter:orphan-ch01",
                json_payload: JSON.stringify({
                  title: "Stand-alone Oneshots Special Chapter",
                  permalink: "orphan-ch01",
                  pages: makePages(3),
                  tags: [],
                }),
              },
            ],
          };
        }
        if (sql.includes("FROM READING_PROGRESS")) {
          return {
            rows: [
              { chapter_permalink: "hana-ni-arashi-ch01", series_permalink: "hana-ni-arashi", series_name: "Hana ni Arashi", chapter_title: "Chapter 1: The Secret", page_index: 10, page_total: 20, completed: 0, updated_at: Date.now() - 1800000 },
            ],
          };
        }
        if (sql.includes("FROM READING_HISTORY")) {
          return {
            rows: [
              { id: 1, chapter_permalink: "hana-ni-arashi-ch01", series_permalink: "hana-ni-arashi", series_name: "Hana ni Arashi", chapter_title: "Chapter 1: The Secret", read_at: Date.now() - 1800000 },
            ],
          };
        }
        if (sql.includes("FROM BOOKMARKS")) {
          return {
            rows: [
              { chapter_permalink: "hana-ni-arashi-ch02", series_permalink: "hana-ni-arashi", series_name: "Hana ni Arashi", chapter_title: "Chapter 2: Rooftop Lunch", page_index: 5, created_at: Date.now() - 3600000 },
            ],
          };
        }
        if (sql.includes("FROM FOLLOWED_MANGA")) {
          return {
            rows: [
              {
                manga_id: "6bae5c8c-d5ff-43df-acf7-b7670532c8b1",
                title: "Yoku Wakaranai keredo Isekai ni Tensei Shiteita You Desu",
                cover_filename: null,
                last_checked_at: Date.now(),
                created_at: Date.now() - 3600000,
              },
            ],
          };
        }
        if (sql.includes("FROM READING_HISTORY")) {
          return {
            rows: [
              {
                id: 1,
                chapter_id: "ch-uuid-1a",
                manga_id: "6bae5c8c-d5ff-43df-acf7-b7670532c8b1",
                manga_title: "Yoku Wakaranai keredo Isekai ni Tensei Shiteita You Desu",
                chapter_title: "Ch. 1 - The Rebirth",
                scanlator_name: "Scanlator Alpha",
                read_at: Date.now() - 1800000,
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
        if (url.includes("api.mangadex.org")) {
          if (url.includes("/at-home/server/")) {
            return {
              status: 200,
              body: JSON.stringify({
                result: "ok",
                baseUrl: "https://uploads.mangadex.org",
                chapter: {
                  hash: "mockhash123",
                  data: ["1.jpg", "2.jpg"],
                  dataSaver: ["1.jpg", "2.jpg"],
                },
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
                  attributes: {
                    volume: "1",
                    chapter: "1",
                    title: "The Rebirth",
                    translatedLanguage: "en",
                    readableAt: "2024-01-01T00:00:00+00:00",
                    pages: 2,
                  },
                  relationships: [
                    {
                      id: "6bae5c8c-d5ff-43df-acf7-b7670532c8b1",
                      type: "manga",
                      attributes: {
                        title: { en: "Yoku Wakaranai keredo Isekai ni Tensei Shiteita You Desu" },
                      },
                    },
                    {
                      id: "group-alpha",
                      type: "scanlation_group",
                      attributes: { name: "Scanlator Alpha" },
                    },
                  ],
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
                    attributes: {
                      volume: "1",
                      chapter: "1",
                      title: "The Rebirth",
                      translatedLanguage: "en",
                      readableAt: "2024-01-01T00:00:00+00:00",
                      pages: 20,
                    },
                    relationships: [
                      {
                        id: "group-alpha",
                        type: "scanlation_group",
                        attributes: { name: "Scanlator Alpha" },
                      },
                      {
                        id: "6bae5c8c-d5ff-43df-acf7-b7670532c8b1",
                        type: "manga",
                        attributes: {
                          title: { en: "Yoku Wakaranai keredo Isekai ni Tensei Shiteita You Desu" },
                        },
                      },
                    ],
                  },
                  {
                    id: "ch-uuid-2",
                    type: "chapter",
                    attributes: {
                      volume: "1",
                      chapter: "2",
                      title: "Magic Discovery",
                      translatedLanguage: "en",
                      readableAt: "2024-01-08T00:00:00+00:00",
                      pages: 22,
                    },
                    relationships: [
                      {
                        id: "group-alpha",
                        type: "scanlation_group",
                        attributes: { name: "Scanlator Alpha" },
                      },
                      {
                        id: "6bae5c8c-d5ff-43df-acf7-b7670532c8b1",
                        type: "manga",
                        attributes: {
                          title: { en: "Yoku Wakaranai keredo Isekai ni Tensei Shiteita You Desu" },
                        },
                      },
                    ],
                  },
                ],
                total: 2,
                limit: 24,
                offset: 0,
              }),
            };
          }
          if (url.includes("/manga/tag")) {
            return {
              status: 200,
              body: JSON.stringify({
                result: "ok",
                response: "collection",
                data: [
                  {
                    id: "a3c67850-4684-404e-9b7f-c69850ee5da6",
                    type: "tag",
                    attributes: { name: { en: "Girls' Love" }, group: "genre" },
                  },
                  {
                    id: "3e2b8dae-350e-4ab8-a8ce-016e844b9f0d",
                    type: "tag",
                    attributes: { name: { en: "Romance" }, group: "genre" },
                  },
                  {
                    id: "4d32cc48-9f00-4cca-9b5a-a839f0764984",
                    type: "tag",
                    attributes: { name: { en: "Comedy" }, group: "genre" },
                  },
                ],
              }),
            };
          }
          if (url.includes("/feed")) {
            return {
              status: 200,
              body: JSON.stringify({
                result: "ok",
                response: "collection",
                data: [
                  {
                    id: "ch-uuid-1a",
                    type: "chapter",
                    attributes: {
                      volume: "1",
                      chapter: "1",
                      title: "The Rebirth",
                      translatedLanguage: "en",
                      readableAt: "2024-01-01T00:00:00+00:00",
                      pages: 20,
                    },
                    relationships: [
                      {
                        id: "group-alpha",
                        type: "scanlation_group",
                        attributes: { name: "Scanlator Alpha" },
                      },
                    ],
                  },
                  {
                    id: "ch-uuid-1b",
                    type: "chapter",
                    attributes: {
                      volume: "1",
                      chapter: "1",
                      title: "The Rebirth (Alt)",
                      translatedLanguage: "en",
                      readableAt: "2024-01-02T00:00:00+00:00",
                      pages: 20,
                    },
                    relationships: [
                      {
                        id: "group-beta",
                        type: "scanlation_group",
                        attributes: { name: "Scanlator Beta" },
                      },
                    ],
                  },
                  {
                    id: "ch-uuid-2",
                    type: "chapter",
                    attributes: {
                      volume: "1",
                      chapter: "2",
                      title: "Magic Discovery",
                      translatedLanguage: "en",
                      readableAt: "2024-01-08T00:00:00+00:00",
                      pages: 22,
                    },
                    relationships: [
                      {
                        id: "group-alpha",
                        type: "scanlation_group",
                        attributes: { name: "Scanlator Alpha" },
                      },
                    ],
                  },
                ],
                total: 3,
                limit: 100,
                offset: 0,
              }),
            };
          }
          if (url.includes("/manga/6bae5c8c-d5ff-43df-acf7-b7670532c8b1")) {
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
                    altTitles: [],
                    description: { en: "Ren discovers magic in another world." },
                    status: "ongoing",
                    contentRating: "safe",
                    tags: [
                      {
                        id: "a3c67850-4684-404e-9b7f-c69850ee5da6",
                        type: "tag",
                        attributes: { name: { en: "Girls' Love" }, group: "genre" },
                      },
                    ],
                  },
                  relationships: [
                    { id: "cover-1", type: "cover_art", attributes: { fileName: "cover.jpg" } },
                    { id: "author-1", type: "author", attributes: { name: "Ashi" } },
                  ],
                },
              }),
            };
          }
          if (url.includes("/manga")) {
            return {
              status: 200,
              body: JSON.stringify({
                result: "ok",
                response: "collection",
                data: [
                  {
                    id: "6bae5c8c-d5ff-43df-acf7-b7670532c8b1",
                    type: "manga",
                    attributes: {
                      title: { en: "Yoku Wakaranai keredo Isekai ni Tensei Shiteita You Desu" },
                      altTitles: [],
                      description: { en: "Ren discovers magic in another world." },
                    status: "ongoing",
                    latestUploadedChapter: "ch-uuid-1a",
                    contentRating: "safe",
                      tags: [
                        {
                          id: "a3c67850-4684-404e-9b7f-c69850ee5da6",
                          type: "tag",
                          attributes: { name: { en: "Girls' Love" }, group: "genre" },
                        },
                      ],
                    },
                    relationships: [
                      { id: "cover-1", type: "cover_art", attributes: { fileName: "cover.jpg" } },
                      { id: "author-1", type: "author", attributes: { name: "Ashi" } },
                    ],
                  },
                ],
                total: 1,
                limit: 24,
                offset: 0,
              }),
            };
          }
        }
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
          const makePage = (num, color) => ({
            url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1200' viewBox='0 0 800 1200'><rect fill='${color}' width='100%' height='100%'/><text x='400' y='600' font-size='64' font-family='sans-serif' text-anchor='middle' fill='%23ffffff'>Page ${num}</text></svg>`,
            name: `0${num}.svg`
          });
          return {
            status: 200,
            body: JSON.stringify({
              title: "Chapter 1: The Secret",
              permalink: "hana-ni-arashi-ch01",
              pages: [
                makePage(1, "%233b82f6"),
                makePage(2, "%2310b981"),
                makePage(3, "%23f59e0b"),
                makePage(4, "%238b5cf6"),
                makePage(5, "%23ec4899"),
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
