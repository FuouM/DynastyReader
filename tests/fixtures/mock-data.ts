/**
 * Realistic fixtures for browser test sweeps and UI audits.
 */

export const MOCK_SERIES = {
  permalink: "hana-ni-arashi",
  name: "Hana ni Arashi",
  type: "Series",
  description: "Nanoha and Chidori are dating in secret.",
  cover: "/mock-cover.jpg",
  aliases: [],
  tags: [
    { type: "Author", name: "Kobachi Ruka", permalink: "kobachi-ruka" },
    { type: "Genre", name: "Romance", permalink: "romance" },
    { type: "General", name: "School Life", permalink: "school-life" },
  ],
  taggings: [
    {
      permalink: "hana-ni-arashi-ch01",
      title: "Chapter 1: The Secret",
      released_on: "2024-01-01",
    },
    {
      permalink: "hana-ni-arashi-ch02",
      title: "Chapter 2: Rooftop Lunch",
      released_on: "2024-01-08",
    },
    {
      permalink: "hana-ni-arashi-ch03",
      title: "Chapter 3: Rainy Day",
      released_on: "2024-01-15",
    },
  ],
};

export const MOCK_CHAPTER = {
  title: "Chapter 1: The Secret",
  permalink: "hana-ni-arashi-ch01",
  pages: [
    { url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1200'><rect fill='%23cccccc' width='100%' height='100%'/></svg>", name: "01.svg" },
    { url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1200'><rect fill='%23aaaaaa' width='100%' height='100%'/></svg>", name: "02.svg" },
  ],
};

export const MOCK_FOLLOWED_SERIES = [
  {
    permalink: "hana-ni-arashi",
    name: "Hana ni Arashi",
    cover: "/mock-cover.jpg",
    last_checked_at: Date.now() - 3600000,
    latest_chapter_permalink: "hana-ni-arashi-ch03",
    latest_chapter_title: "Chapter 3: Rainy Day",
    created_at: Date.now() - 86400000 * 7,
  },
  {
    permalink: "whisper-me-a-love-song",
    name: "Whisper Me a Love Song",
    cover: "/mock-cover-2.jpg",
    last_checked_at: Date.now() - 7200000,
    latest_chapter_permalink: "whisper-me-a-love-song-ch45",
    latest_chapter_title: "Chapter 45",
    created_at: Date.now() - 86400000 * 14,
  },
];

export const MOCK_READING_PROGRESS = [
  {
    chapter_permalink: "hana-ni-arashi-ch01",
    series_permalink: "hana-ni-arashi",
    series_name: "Hana ni Arashi",
    chapter_title: "Chapter 1: The Secret",
    page_index: 10,
    page_total: 20,
    completed: 0,
    updated_at: Date.now() - 1800000,
  },
];

export const MOCK_READING_HISTORY = [
  {
    id: 1,
    chapter_permalink: "hana-ni-arashi-ch01",
    series_permalink: "hana-ni-arashi",
    series_name: "Hana ni Arashi",
    chapter_title: "Chapter 1: The Secret",
    read_at: Date.now() - 1800000,
  },
];

export const MOCK_BOOKMARKS = [
  {
    chapter_permalink: "hana-ni-arashi-ch01",
    series_permalink: "hana-ni-arashi",
    series_name: "Hana ni Arashi",
    chapter_title: "Chapter 1: The Secret",
    page_index: 5,
    created_at: Date.now() - 3600000,
  },
];

export const MOCK_DOWNLOAD_QUEUE = [
  {
    id: "dl-1",
    chapter_permalink: "hana-ni-arashi-ch02",
    series_permalink: "hana-ni-arashi",
    series_name: "Hana ni Arashi",
    chapter_title: "Chapter 2: Rooftop Lunch",
    status: "downloading",
    progress: 0.65,
    total_pages: 22,
    downloaded_pages: 14,
    speed_bytes_sec: 1450000,
    error: null,
  },
  {
    id: "dl-2",
    chapter_permalink: "hana-ni-arashi-ch03",
    series_permalink: "hana-ni-arashi",
    series_name: "Hana ni Arashi",
    chapter_title: "Chapter 3: Rainy Day",
    status: "queued",
    progress: 0,
    total_pages: 18,
    downloaded_pages: 0,
    speed_bytes_sec: 0,
    error: null,
  },
];

export const MOCK_LOCAL_SERIES = [
  {
    permalink: "local-manga-1",
    title: "My Local Manga",
    author: "Local Artist",
    path: "/mock/comics/local-manga",
    cover: null,
    chapter_count: 5,
    created_at: Date.now() - 86400000,
  },
];

export const MOCK_BLACKLIST = {
  tags: [
    { tag_name: "Tragedy", tag_permalink: "tragedy", created_at: Date.now() - 86400000 * 30 },
  ],
  series: [
    { series_permalink: "unwanted-series", series_name: "Unwanted Series", created_at: Date.now() - 86400000 * 10 },
  ],
};
