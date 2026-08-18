# DynastyReader: Unofficial Dynasty Scans Desktop Client

DynastyReader is an unofficial desktop reader for [Dynasty Scans](https://dynasty-scans.com/), built with Rust and Tauri v2. It stores metadata, reading progress, and downloaded chapters locally in SQLite, using conditional ETag caching to keep upstream server requests minimal.

- [DynastyReader: Unofficial Dynasty Scans Desktop Client](#dynastyreader-unofficial-dynasty-scans-desktop-client)
  - [1. Overview \& Design Goals](#1-overview--design-goals)
  - [2. Tech Stack](#2-tech-stack)
  - [3. Features](#3-features)
  - [4. Roadmap](#4-roadmap)
  - [5. Data Storage \& Layout](#5-data-storage--layout)
  - [6. Build \& Setup](#6-build--setup)
  - [7. LLM Attribution](#7-llm-attribution)
  - [8. License](#8-license)

<div align="center">
  <img src="public/icon.svg" alt="img" width="256" />
</div>

## 1. Overview & Design Goals

DynastyReader was extracted from [Project Curator](https://github.com/FuouM/Project-Curator) into a standalone desktop application with a few specific design priorities:

- **Low Server Impact**: Uses conditional HTTP requests (`If-None-Match` / `ETag`) and connection pooling to avoid re-downloading unchanged metadata. Mass scraping and bulk chapter downloader features are intentionally omitted.
- **Local & Anonymous**: No accounts or logins. Bookmarks, history, subscriptions, and cached metadata stay on your local machine.
- **Self-Contained & Portable**: Configuration, database files, covers, and cached pages live in a single `.data/` folder next to the executable.
- **Offline Reading**: Individual chapters can be cached for offline viewing, with page-level progress saved locally.

## 2. Tech Stack

- **Backend / Runtime**: Rust (2021 edition), Tauri v2
- **Async Runtime**: Tokio
- **HTTP Client**: Reqwest (`rustls-tls`, HTTP/2 connection pooling)
- **Database**: SQLite 3 via `rusqlite` (WAL mode, foreign keys enabled)
- **Image Processing**: `image` crate (WebP transcoding)
- **Frontend**: TypeScript, Vite 6, Vanilla CSS (`curator-ui-base.css`)
- **Icons**: Bootstrap Icons font

## 3. Features

### 3.1. Metadata & Feed Caching

Directory listings and feed endpoints (`/chapters.json`, `/chapters/added.json`) are cached in SQLite using a stale-while-revalidate strategy. Stored entries render instantly, while a background request checks for updates via `If-None-Match`. A `304 Not Modified` response simply refreshes the local timestamp without re-fetching data.

### 3.2. Offline Chapters & Cache Control

Chapters can be saved locally for offline reading into `.data/pages/<series>/<chapter>/`. The built-in Cache Management panel shows on-disk storage usage by series and allows deleting specific chapters or clearing all stored images.

### 3.3. Reader & Progress Tracking

- Supports single-page and continuous vertical scroll modes.
- Fit-to-width, fit-to-height, and custom zoom controls with keyboard navigation.
- Progress (current page, total pages, completion status) writes to SQLite on page changes, allowing exact resumption when reopening a chapter.

### 3.4. Tag Management & Blacklisting

Dynasty tags are grouped by category (Author, Scanlator, Pairing, Doujin, Series, Anthology, Issue, General). Blacklisted tags can be configured to either hide matching entries completely or require a confirmation prompt before opening.

## 4. Roadmap

- [ ] **Dual-Page Spread Mode**: Two-page spread reading with RTL/LTR order and cover page offset alignment.
- [ ] **Custom Collections / Favorites**: User-defined lists and custom tag groups beyond followed series.
- [ ] **App-Wide Dark Theme**: Extend dark mode styling to the rest of the app (currently limited to the reader view).
- [ ] **Linux Distribution**: AppImage, Flatpak, and native packages for Linux desktop environments.
- [ ] **Android Port**: Mobile touch-optimized UI and build targets using Tauri Mobile.

## 5. Data Storage & Layout

All application data is stored in the `.data/` folder next to the executable:

```text
.data/
├── dynasty_reader.db       # SQLite database (history, bookmarks, subscriptions, progress, blacklists)
├── covers/                 # Cached series and chapter covers (.webp)
├── pages/                  # Downloaded offline chapter pages
│   └── <series_slug>/
│       └── <chapter_slug>/
│           ├── page_0001.jpg
│           ├── page_0002.jpg
│           └── ...
└── logs/
    └── dynasty-reader.log  # Application logs
```

## 6. Build & Setup

### 6.1. Prerequisites

- **Node.js**: >= 20.x and `npm`
- **Rust**: `stable-x86_64-pc-windows-msvc` (Cargo >= 1.80)
- **sccache** *(Optional)*: Automatically used for build caching if present in `.rust/.cargo/bin/sccache.exe`.

### 6.2. Optional: Isolated Toolchain Setup (Windows)

To bootstrap a local, portable Rust environment inside the project folder without system-wide changes:

```powershell
.\setup_env.ps1
```

### 6.3. Development

```powershell
# 1. Load the local toolchain environment (skip if using system Rust)
. .\env.ps1

# 2. Start Vite + Tauri dev mode
.\dev.ps1
```

### 6.4. Release Build

To build and assemble the standalone portable distribution:

```powershell
# Build and stage to portable/ directory
.\build_release_portable.ps1

# Optional: also package as a .zip archive
.\build_release_portable.ps1 -Zip
```

The output standalone folder will be staged at:

```text
portable/
├── DynastyReader.exe
├── README.md
└── LICENSE
```

Copy `DynastyReader.exe` to any folder; it will initialize the `.data/` directory automatically on launch.

---

## 7. LLM Attribution

Development assistance provided by:

- Gemini 3.5, 3.6, and 3.7
- DeepSeek V4 Flash 0731

## 8. License

Distributed under the MIT License. See `LICENSE` for details.  

*DynastyReader is an independent open-source project and is not affiliated with Dynasty Scans.*

>Yuri shall conquer the earth!
