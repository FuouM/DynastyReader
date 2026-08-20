/**
 * Solid Browse downloaded-chapters pane. Port of `browse-downloaded.ts`:
 * lists fully-cached chapters for offline reading with a quick filter and
 * local pagination (25/page). The filter resets when leaving the Browse view.
 */

import { createEffect, createSignal, For, Show, type Accessor } from "solid-js";
import { formatBytes, formatDate, route } from "../stores";
import { getFullyCachedChapters, type FullyCachedChapterRow } from "../db";
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
import { FeedItemRow } from "../components/FeedItemRow";
import { AddToCollectionModal, type AddToCollectionItem } from "../components/AddToCollectionModal";

const PAGE_SIZE = 25;

function DownloadedRow(props: {
  ch: FullyCachedChapterRow;
  onAddToCol: (item: AddToCollectionItem, anchorEl: HTMLElement) => void;
}) {
  const { ch } = props;
  return (
    <FeedItemRow
      item={{
        permalink: ch.chapterPermalink,
        title: ch.chapterTitle,
        series: ch.seriesName,
        tags: ch.tags,
      }}
      coverPath={ch.coverPath}
      isFullyCached={true}
      extraMeta={
        <>
          <span class="ds-muted">✓ {ch.pageCount} pages</span>
          <Show when={ch.totalSizeBytes > 0}>
            <span class="ds-muted">· {formatBytes(ch.totalSizeBytes)}</span>
          </Show>
          <Show when={ch.lastCachedAt > 0}>
            <span class="ds-muted">· {formatDate(ch.lastCachedAt)}</span>
          </Show>
        </>
      }
      onAddToCol={props.onAddToCol}
    />
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
  const [addToCol, setAddToCol] = createSignal<{
    item: AddToCollectionItem;
    anchorEl: HTMLElement;
  } | null>(null);

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
            <For each={pageItems()}>
              {(ch) => (
                <DownloadedRow
                  ch={ch}
                  onAddToCol={(item, anchorEl) => setAddToCol({ item, anchorEl })}
                />
              )}
            </For>
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

      <AddToCollectionModal
        open={addToCol() !== null}
        item={addToCol()?.item ?? { permalink: "", title: "" }}
        anchorEl={addToCol()?.anchorEl ?? null}
        onClose={() => setAddToCol(null)}
      />
    </div>
  );
}