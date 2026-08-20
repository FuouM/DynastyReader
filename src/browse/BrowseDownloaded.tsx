/**
 * Solid Browse downloaded-chapters pane. Port of `browse-downloaded.ts`:
 * lists fully-cached chapters for offline reading with a quick filter and
 * local pagination (25/page). The filter resets when leaving the Browse view.
 */

import { createEffect, createSignal, For, Show, type Accessor } from "solid-js";
import { decodeEntities, formatBytes, formatDate, navigate, route } from "../stores";
import { getFullyCachedChapters, type FullyCachedChapterRow } from "../db";
import { convertFileSrc } from "../ipc";
import {
  scrollBrowseToTop,
  setPaneLoading,
  setTopPagerFor,
  useDelayedSpinner,
  useTabPane,
} from "./browse-state";
import { Pager } from "../components/Pager";
import { Loading } from "../components/Loading";
import { InputField } from "../components/InputField";

const PAGE_SIZE = 25;

function DownloadedRow(props: { ch: FullyCachedChapterRow }) {
  const { ch } = props;
  const [coverError, setCoverError] = createSignal(false);

  const openChapter = (): void => {
    navigate({
      view: "reader",
      seriesPermalink: ch.seriesPermalink ?? undefined,
      seriesName: ch.seriesName ?? undefined,
      chapterPermalink: ch.chapterPermalink,
      chapterTitle: ch.chapterTitle,
    });
  };

  return (
    <div
      class="ds-item ds-feed-item"
      style="display:flex;align-items:center;gap:10px;padding:6px 8px;cursor:pointer;"
      onClick={openChapter}
    >
      <div
        class="ds-feed-cover-wrap"
        style="flex-shrink:0;width:38px;height:52px;background:var(--sys-control-bg,#e2e2e2);border:1px solid var(--sys-border-light,#ccc);border-radius:2px;overflow:hidden;display:flex;align-items:center;justify-content:center;"
      >
        <Show
          when={ch.coverPath && !coverError()}
          fallback={
            <i class="bi bi-book" style="color:var(--sys-text-muted,#888);font-size:16px;"></i>
          }
        >
          <img
            src={convertFileSrc(ch.coverPath!)}
            style="width:100%;height:100%;object-fit:cover;display:block;"
            loading="lazy"
            onError={() => setCoverError(true)}
          />
        </Show>
      </div>

      <div class="ds-fill" style="display:flex;flex-direction:column;gap:4px;">
        <div class="ds-flex-row" style="flex-wrap:wrap;">
          <span class="ds-item-title" style="font-weight:600;font-size:12px;color:var(--sys-window-text,#111);">
            {decodeEntities(ch.chapterTitle)}
          </span>
          <i
            class="bi bi-cloud-check-fill ds-offline-icon"
            style="color:var(--sys-primary,#0078d4);font-size:11px;"
            title="Available Offline (Fully Cached)"
          ></i>
        </div>
        <div class="ds-flex-row" style="flex-wrap:wrap;font-size:11px;">
          <Show when={ch.seriesName && ch.seriesPermalink}>
            <span
              class="ds-series-link"
              title={`Go to series: ${decodeEntities(ch.seriesName!)}`}
              onClick={(ev) => {
                ev.stopPropagation();
                navigate({
                  view: "series",
                  seriesPermalink: ch.seriesPermalink!,
                  seriesName: ch.seriesName!,
                });
              }}
            >
              {decodeEntities(ch.seriesName!)}
            </span>
          </Show>
          <span class="ds-muted">✓ {ch.pageCount} pages</span>
          <Show when={ch.totalSizeBytes > 0}>
            <span class="ds-muted">· {formatBytes(ch.totalSizeBytes)}</span>
          </Show>
          <Show when={ch.lastCachedAt > 0}>
            <span class="ds-muted">· {formatDate(ch.lastCachedAt)}</span>
          </Show>
        </div>
      </div>

      <button
        type="button"
        class="win-button ds-btn-sm"
        style="font-size:11px;padding:2px 10px;flex-shrink:0;"
        title={`Read "${decodeEntities(ch.chapterTitle)}"`}
        onClick={(ev) => {
          ev.stopPropagation();
          openChapter();
        }}
      >
        <i class="bi bi-book"></i> Read
      </button>
    </div>
  );
}

export interface BrowseDownloadedProps {
  tabId: string;
  active: Accessor<boolean>;
  revision: Accessor<number>;
  forceTick: Accessor<number>;
}

export function BrowseDownloaded(props: BrowseDownloadedProps) {
  const pane = useTabPane<FullyCachedChapterRow[]>({
    active: props.active,
    revision: props.revision,
    forceTick: props.forceTick,
    load: async (_page) => getFullyCachedChapters(),
  });
  const showSpinner = useDelayedSpinner(pane.loading);

  const [query, setQuery] = createSignal("");
  const [page, setPage] = createSignal(1);

  createEffect(() => setPaneLoading(props.tabId, pane.loading()));

  // Reset the filter + page when leaving the Browse view (matches
  // `resetDownloadedState`).
  createEffect(() => {
    if (route().view !== "browse") {
      setQuery("");
      setPage(1);
    }
  });

  // Filter changes reset to page 1.
  createEffect(() => {
    query();
    setPage(1);
  });

  const filtered = (): FullyCachedChapterRow[] => {
    const rows = pane.data();
    if (!rows) return [];
    const q = query().trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.chapterTitle.toLowerCase().includes(q) ||
        (c.seriesName && c.seriesName.toLowerCase().includes(q)) ||
        c.chapterPermalink.toLowerCase().includes(q),
    );
  };

  const totalPages = (): number => Math.max(1, Math.ceil(filtered().length / PAGE_SIZE));

  const currentPage = (): number => Math.min(page(), totalPages());

  const pageItems = (): FullyCachedChapterRow[] => {
    const start = (currentPage() - 1) * PAGE_SIZE;
    return filtered().slice(start, start + PAGE_SIZE);
  };

  const goToPage = (p: number): void => {
    setPage(p);
    scrollBrowseToTop();
  };

  createEffect(() => {
    setTopPagerFor(props.tabId, {
      totalPages: totalPages(),
      currentPage: currentPage(),
      onPage: (p) => goToPage(p),
    });
  });

  const totalBytes = (): number =>
    (pane.data() ?? []).reduce((acc, c) => acc + c.totalSizeBytes, 0);

  const model = (): FullyCachedChapterRow[] | undefined => pane.data();

  return (
    <div class="ds-tab-pane active" id="ds-tab-downloaded">
      <div id="ds-downloaded-header">
        <span class="ds-downloaded-count">
          {filtered().length} downloaded {filtered().length === 1 ? "chapter" : "chapters"}
          <Show when={totalBytes() > 0}>
            <span class="ds-downloaded-size"> · {formatBytes(totalBytes())}</span>
          </Show>
        </span>
      </div>

      <div id="ds-downloaded-filter-wrap">
        <InputField
          placeholder="Filter downloaded chapters & series…"
          value={query()}
          onInput={setQuery}
          onClear={() => setQuery("")}
        />
      </div>

      <div id="ds-downloaded-body">
        <Show when={filtered().length === 0 && pane.data() !== undefined}>
          <div class="ds-empty-state" style="padding:24px;text-align:center;">
            <i class="bi bi-cloud-arrow-down" style="font-size:28px;opacity:0.6;display:block;margin-bottom:8px;"></i>
            <span class="ds-muted">
              {query().trim()
                ? "No downloaded chapters match your filter."
                : "No downloaded chapters found. Read a chapter with Auto-Cache enabled to save it for offline reading."}
            </span>
          </div>
        </Show>

        <Show when={pageItems().length > 0}>
          <div class="ds-feed-list" style="display:flex;flex-direction:column;gap:6px;">
            <For each={pageItems()}>{(ch) => <DownloadedRow ch={ch} />}</For>
          </div>
        </Show>
      </div>

      <div id="ds-downloaded-pager">
        <Show when={totalPages() > 1}>
          <Pager totalPages={totalPages()} currentPage={currentPage()} onPage={(p) => goToPage(p)} />
        </Show>
      </div>

      <Show when={showSpinner() && model() === undefined}>
        <Loading message="Loading downloaded chapters..." />
      </Show>
    </div>
  );
}