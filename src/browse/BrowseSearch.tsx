/**
 * Solid Browse in-app Search tab. Port of `browse-search.ts`:
 *
 *  - live search state (query, category filters, with/without tag chips, sort)
 *  - `searchDynasty` results with blacklist split (hide/warn), offline icons,
 *    kind icons, author/doujin links, and add-to-collection quick actions
 *  - typeahead suggestions via `suggest` for the query and tag inputs
 */

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  type Accessor,
  type JSX,
} from "solid-js";
import { decodeEntities, navigate, setBanner, sortTagsByCategory } from "../stores";
import { searchDynasty, suggest } from "../api";
import {
  getBlacklistMode,
  getFullyCachedChapterPermalinks,
  isItemBlacklisted,
  type BlacklistMode,
  type CollectionItemKind,
} from "../db";
import {
  setPaneError,
  setPaneLoading,
  setTopPagerFor,
  useDelayedSpinner,
  useTabPane,
} from "./browse-state";
import { Pager } from "../components/Pager";
import { TagPill } from "../components/TagPill";
import { Loading } from "../components/Loading";
import { Typeahead } from "../components/Typeahead";
import { TriggerWarningModal } from "../components/TriggerWarning";
import { AddToCollectionModal, type AddToCollectionItem } from "../components/AddToCollectionModal";
import type {
  SearchClass,
  SearchResultItem,
  SearchResultPage,
  SearchSort,
} from "../types/api";

const ALL_CLASSES: { id: SearchClass; label: string }[] = [
  { id: "Series", label: "Series" },
  { id: "Chapter", label: "Chapter" },
  { id: "Anthology", label: "Anthology" },
  { id: "Doujin", label: "Doujin" },
  { id: "Issue", label: "Issue" },
  { id: "Author", label: "Author" },
  { id: "Scanlator", label: "Scanlator" },
  { id: "General", label: "Tag" },
  { id: "Pairing", label: "Pairing" },
];

const KIND_ICON: Record<SearchResultItem["kind"], string> = {
  chapter: "bi-file-earmark-text",
  series: "bi-collection-play",
  anthology: "bi-journal-album",
  doujin: "bi-book",
  issue: "bi-newspaper",
  author: "bi-person",
  scanlator: "bi-people",
  pairing: "bi-heart",
  tag: "bi-tag",
};

const KIND_COLOR: Record<SearchResultItem["kind"], string> = {
  chapter: "#0078d4",
  series: "#d83b01",
  anthology: "#107c41",
  doujin: "#8764b8",
  issue: "#b146c2",
  author: "#008272",
  scanlator: "#5c2d91",
  pairing: "#e3008c",
  tag: "#69797e",
};

interface SearchRow {
  item: SearchResultItem;
  isBlacklisted: boolean;
  matchedTags: string[];
}

interface SearchModel {
  pageData: SearchResultPage;
  fullyCachedSet: Set<string>;
  blMode: BlacklistMode;
}

function SearchResultRow(props: {
  row: SearchRow;
  isFullyCached: boolean;
  blMode: BlacklistMode;
  onWarn: (title: string, matchedTags: string[], proceed: () => void) => void;
  onAddToCol: (item: AddToCollectionItem, anchorEl: HTMLElement) => void;
}) {
  const { item, isBlacklisted, matchedTags } = props.row;

  const onOpenItem = (): void => {
    const doNavigate = (): void => {
      if (item.kind === "chapter") {
        navigate({
          view: "reader",
          chapterPermalink: item.permalink,
          chapterTitle: item.title,
        });
      } else {
        navigate({
          view: "series",
          seriesPermalink: item.permalink,
          seriesName: item.title,
        });
      }
    };
    if (isBlacklisted && matchedTags.length > 0) {
      props.onWarn(item.title, matchedTags, doNavigate);
    } else {
      doNavigate();
    }
  };

  const actionLabel =
    item.kind === "chapter" ? "Read" : ["series", "anthology", "doujin", "issue"].includes(item.kind) ? "Open" : "View";
  const actionIcon =
    item.kind === "chapter"
      ? "bi-book"
      : ["series", "anthology", "doujin", "issue"].includes(item.kind)
        ? "bi-folder2-open"
        : "bi-arrow-right-circle";

  const isCollectible =
    item.kind === "series" ||
    item.kind === "chapter" ||
    item.kind === "doujin" ||
    item.kind === "anthology" ||
    item.kind === "issue";

  return (
    <div
      class="ds-item ds-row"
      style={`border-radius:3px;padding:6px 10px;align-items:flex-start;gap:8px;cursor:pointer;${
        isBlacklisted ? "opacity:0.8;background:var(--sys-bg-active,#fcf8f8);" : ""
      }`}
      onClick={onOpenItem}
    >
      <div style="font-size:16px;margin-top:2px;min-width:20px;text-align:center;">
        <i class={KIND_ICON[item.kind]} style={`color:${KIND_COLOR[item.kind]};`}></i>
      </div>

      <div class="ds-fill" style="display:flex;flex-direction:column;gap:3px;">
        <div class="ds-flex-row" style="flex-wrap:wrap;">
          <span
            class="ds-search-title-link"
            style="font-size:12px;font-weight:600;color:var(--sys-text-primary,#000);text-decoration:none;display:inline-flex;align-items:center;gap:4px;"
            title={`Open ${item.title}`}
          >
            <span>{decodeEntities(item.title)}</span>
            <Show when={props.isFullyCached}>
              <i
                class="bi bi-cloud-check-fill ds-offline-icon"
                style="color:var(--sys-primary,#0078d4);font-size:11px;"
                title="Available Offline (Fully Cached)"
              ></i>
            </Show>
          </span>
          <span
            class="ds-muted"
            style="font-size:10px;background:var(--sys-hover-bg,#eaeaea);padding:1px 5px;border-radius:2px;text-transform:capitalize;"
          >
            {item.kind}
          </span>
          <Show when={isBlacklisted && matchedTags.length > 0}>
            <span
              style="font-size:9px;background:var(--ds-danger-bg);color:var(--ds-danger-text);padding:1px 5px;border-radius:2px;border:1px solid var(--ds-danger-border);display:inline-flex;align-items:center;gap:3px;font-weight:600;"
            >
              <i class="bi bi-exclamation-triangle-fill"></i>{" "}
              {props.blMode === "warn" ? "Content Warning" : "Blacklisted"}:{" "}
              {decodeEntities(matchedTags.join(", "))}
            </span>
          </Show>
        </div>

        <Show
          when={item.author || item.doujin || item.releasedOn}
        >
          <div class="ds-row" style="gap:8px;align-items:center;flex-wrap:wrap;">
            <Show when={item.author}>
              <span class="ds-muted" style="font-size:11px;">
                by{" "}
                <a
                  style="color:var(--sys-primary,#0078d4);cursor:pointer;text-decoration:underline;"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    navigate({
                      view: "series",
                      seriesPermalink: item.author!.permalink,
                      seriesName: item.author!.name,
                    });
                  }}
                >
                  {decodeEntities(item.author!.name)}
                </a>
              </span>
            </Show>
            <Show when={item.doujin}>
              <span class="ds-muted" style="font-size:11px;">
                <a
                  style="color:var(--sys-primary,#0078d4);cursor:pointer;text-decoration:underline;"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    navigate({
                      view: "series",
                      seriesPermalink: item.doujin!.permalink,
                      seriesName: item.doujin!.name,
                    });
                  }}
                >
                  {decodeEntities(item.doujin!.name)}
                </a>
              </span>
            </Show>
            <Show when={item.releasedOn}>
              <span class="ds-muted" style="font-size:11px;">
                released {item.releasedOn}
              </span>
            </Show>
          </div>
        </Show>

        <Show when={item.tags.length > 0}>
          <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;">
            <For each={sortTagsByCategory(item.tags)}>
              {(t) => <TagPill type={t.type} name={t.name} permalink={t.permalink} />}
            </For>
          </div>
        </Show>
      </div>

      <Show when={isCollectible}>
        <button
          type="button"
          class="win-button ds-btn-compact"
          style="align-self:center;"
          title="Add to Favorites or custom collections"
          onClick={(ev) => {
            ev.stopPropagation();
            props.onAddToCol(
              {
                permalink: item.permalink,
                title: item.title,
                kind: item.kind === "chapter" ? "chapter" : (item.kind as CollectionItemKind),
              },
              ev.currentTarget as HTMLElement,
            );
          }}
        >
          <i class="bi bi-folder-plus"></i>
        </button>
      </Show>

      <button
        type="button"
        class="win-button ds-btn-sm"
        style="align-self:center;white-space:nowrap;"
        onClick={(ev) => {
          ev.stopPropagation();
          onOpenItem();
        }}
      >
        <i class={actionIcon}></i> {actionLabel}
      </button>
    </div>
  );
}

export interface BrowseSearchProps {
  active: Accessor<boolean>;
  revision: Accessor<number>;
  forceTick: Accessor<number>;
  transient: { searchQuery?: string; withTag?: string; searchClass?: string } | null;
  onTransientConsumed: () => void;
}

export function BrowseSearch(props: BrowseSearchProps) {
  const [q, setQ] = createSignal("");
  const [classes, setClasses] = createSignal<Set<SearchClass>>(new Set());
  const [withTags, setWithTags] = createSignal<string[]>([]);
  const [withoutTags, setWithoutTags] = createSignal<string[]>([]);
  const [sort, setSort] = createSignal<SearchSort>("");
  const [withDraft, setWithDraft] = createSignal("");
  const [withoutDraft, setWithoutDraft] = createSignal("");
  const [showHidden, setShowHidden] = createSignal(false);
  const [warning, setWarning] = createSignal<{
    title: string;
    matchedTags: string[];
    onProceed: () => void;
  } | null>(null);
  const [addToCol, setAddToCol] = createSignal<{
    item: AddToCollectionItem;
    anchorEl: HTMLElement;
  } | null>(null);

  const pane = useTabPane<SearchModel>({
    active: props.active,
    revision: props.revision,
    forceTick: props.forceTick,
    load: async (page) => {
      const params = {
        q: q(),
        classes: classes().size > 0 ? Array.from(classes()) : undefined,
        withTags: withTags().length > 0 ? withTags() : undefined,
        withoutTags: withoutTags().length > 0 ? withoutTags() : undefined,
        sort: sort() || undefined,
        page,
      };
      try {
        const pageData = await searchDynasty(params);
        let fullyCachedSet = new Set<string>();
        try {
          fullyCachedSet = await getFullyCachedChapterPermalinks();
        } catch {}
        return { pageData, fullyCachedSet, blMode: getBlacklistMode() };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setBanner(`Search failed: ${msg}`);
        throw err;
      }
    },
  });
  const showSpinner = useDelayedSpinner(pane.loading);

  createEffect(() => {
    setPaneLoading("search", pane.loading());
    setPaneError("search", pane.error() !== undefined);
  });

  // Consume transient search directives (search-box submit, tag-pill click).
  createEffect(() => {
    const t = props.transient;
    if (!t) return;
    if (t.searchQuery !== undefined) setQ(t.searchQuery);
    if (t.withTag && !withTags().includes(t.withTag)) {
      setWithTags((tags) => [...tags, t.withTag!]);
    }
    if (t.searchClass !== undefined) {
      if (t.searchClass) setClasses(new Set([t.searchClass as SearchClass]));
      else setClasses(new Set<SearchClass>());
    }
    setShowHidden(false);
    pane.goToPage(1);
    props.onTransientConsumed();
  });

  const runSearch = (value: string): void => {
    setQ(value.trim());
    pane.goToPage(1);
  };

  const toggleClass = (c: SearchClass): void => {
    setClasses((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
    pane.goToPage(1);
  };

  const clearAll = (): void => {
    setQ("");
    setClasses(new Set<SearchClass>());
    setWithTags([]);
    setWithoutTags([]);
    setSort("");
    pane.goToPage(1);
  };

  const addWithTag = (tag: string): void => {
    const t = tag.trim();
    if (!t) return;
    if (!withTags().includes(t)) setWithTags((tags) => [...tags, t]);
    setWithDraft("");
    pane.goToPage(1);
  };

  const addWithoutTag = (tag: string): void => {
    const t = tag.trim();
    if (!t) return;
    if (!withoutTags().includes(t)) setWithoutTags((tags) => [...tags, t]);
    setWithoutDraft("");
    pane.goToPage(1);
  };

  const removeWithTag = (t: string): void => {
    setWithTags((tags) => tags.filter((x) => x !== t));
    pane.goToPage(1);
  };

  const removeWithoutTag = (t: string): void => {
    setWithoutTags((tags) => tags.filter((x) => x !== t));
    pane.goToPage(1);
  };

  createEffect(() => {
    const model = pane.data();
    if (!model) return;
    setTopPagerFor("search", {
      totalPages: model.pageData.totalPages,
      currentPage: model.pageData.currentPage,
      onPage: (p) => pane.goToPage(p),
    });
  });

  const model = (): SearchModel | undefined => pane.data();

  const resultRows = createMemo<SearchRow[]>(() => {
    const m = model();
    if (!m) return [];
    const rows: SearchRow[] = [];
    for (const item of m.pageData.items) {
      const isSeriesKind =
        item.kind === "series" || item.kind === "anthology" || item.kind === "doujin";
      const seriesInfo = isSeriesKind
        ? { permalink: item.permalink, name: item.title }
        : { name: item.doujin?.name };
      const check = isItemBlacklisted(item.tags, seriesInfo);
      rows.push({ item, isBlacklisted: check.blacklisted, matchedTags: check.matchedTags });
    }
    return rows;
  });

  const normalRows = createMemo<SearchRow[]>(() => resultRows().filter((r) => !r.isBlacklisted));
  const blacklistedRows = createMemo<SearchRow[]>(() => resultRows().filter((r) => r.isBlacklisted));

  const errorMessage = (): string => {
    const e = pane.error();
    if (e instanceof Error) return e.message;
    return String(e);
  };

  const renderResultRow = (row: SearchRow): JSX.Element => (
    <SearchResultRow
      row={row}
      isFullyCached={model()?.fullyCachedSet.has(row.item.permalink) ?? false}
      blMode={model()?.blMode ?? "hide"}
      onWarn={(title, matchedTags, proceed) => setWarning({ title, matchedTags, onProceed: proceed })}
      onAddToCol={(item, anchorEl) => setAddToCol({ item, anchorEl })}
    />
  );

  return (
    <div>
      <div class="group-box" style="margin-bottom:8px;padding:8px;">
        <div class="group-box-title">
          <i class="bi bi-search"></i> In-App Search &amp; Filter
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div class="ds-row" style="gap:6px;">
            <div class="ds-search-wrap" style="flex:1;position:relative;">
              <Typeahead
                value={q()}
                onInputValue={setQ}
                fetcher={suggest}
                onSelect={(item) => {
                  setQ(item.name);
                  pane.goToPage(1);
                }}
                onEnter={(value) => runSearch(value)}
                placeholder="Search keywords (e.g. Bloom Into You, Nakatani, romance)..."
                maxItems={8}
                debounceMs={250}
              />
            </div>
            <button
              type="button"
              class="win-button"
              id="ds-tab-search-submit"
              style="font-weight:600;"
              onClick={() => runSearch(q())}
            >
              <i class="bi bi-search"></i> Search
            </button>
            <button
              type="button"
              class="win-button"
              id="ds-tab-search-reset"
              title="Reset all search filters"
              onClick={clearAll}
            >
              <i class="bi bi-x-circle"></i> Clear
            </button>
          </div>

          <div style="display:flex;flex-direction:column;gap:4px;">
            <div style="font-size:11px;font-weight:600;color:var(--sys-text-secondary,#555);">
              Category Filter:
            </div>
            <div id="ds-search-classes-row" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
              <button
                type="button"
                class={`win-button ds-btn-xs${classes().size === 0 ? " active" : ""}`}
                onClick={() => {
                  setClasses(new Set<SearchClass>());
                  pane.goToPage(1);
                }}
              >
                <Show when={classes().size === 0}>
                  <i class="bi bi-check2" style="font-size:11px;"></i>
                </Show>
                <span>All Categories</span>
              </button>
              <For each={ALL_CLASSES}>
                {(c) => {
                  const isActive = () => classes().has(c.id);
                  return (
                    <button
                      type="button"
                      class={`win-button ds-btn-xs${isActive() ? " active" : ""}`}
                      onClick={() => toggleClass(c.id)}
                    >
                      <Show when={isActive()}>
                        <i class="bi bi-check2" style="font-size:11px;"></i>
                      </Show>
                      <span>{c.label}</span>
                    </button>
                  );
                }}
              </For>
            </div>
          </div>

          <div
            style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:8px;align-items:start;"
          >
            <div style="display:flex;flex-direction:column;gap:4px;">
              <div style="font-size:11px;font-weight:600;color:var(--sys-text-secondary,#555);">
                <i class="bi bi-plus-circle"></i> With Tags:
              </div>
              <div style="position:relative;">
                <Typeahead
                  value={withDraft()}
                  onInputValue={setWithDraft}
                  fetcher={suggest}
                  onSelect={(item) => addWithTag(item.name)}
                  onEnter={(value) => addWithTag(value)}
                  placeholder="Add included tag..."
                  maxItems={6}
                  debounceMs={200}
                />
              </div>
              <div id="ds-search-with-chips" style="display:flex;flex-wrap:wrap;gap:3px;min-height:18px;">
                <For each={withTags()}>
                  {(t) => (
                    <span
                      class="ds-row"
                      style="background:var(--sys-bg-active,#e8f0fe);color:var(--sys-primary,#0078d4);border:1px solid var(--sys-primary,#0078d4);border-radius:3px;padding:1px 5px;font-size:10px;align-items:center;gap:4px;"
                    >
                      <span>+ {decodeEntities(t)}</span>
                      <i class="bi bi-x" style="cursor:pointer;font-size:12px;" onClick={() => removeWithTag(t)}></i>
                    </span>
                  )}
                </For>
              </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:4px;">
              <div style="font-size:11px;font-weight:600;color:var(--sys-text-secondary,#555);">
                <i class="bi bi-dash-circle"></i> Without Tags (Exclude):
              </div>
              <div style="position:relative;">
                <Typeahead
                  value={withoutDraft()}
                  onInputValue={setWithoutDraft}
                  fetcher={suggest}
                  onSelect={(item) => addWithoutTag(item.name)}
                  onEnter={(value) => addWithoutTag(value)}
                  placeholder="Add excluded tag..."
                  maxItems={6}
                  debounceMs={200}
                />
              </div>
              <div id="ds-search-without-chips" style="display:flex;flex-wrap:wrap;gap:3px;min-height:18px;">
                <For each={withoutTags()}>
                  {(t) => (
                    <span
                      class="ds-row"
                      style="background:var(--ds-danger-bg);color:var(--ds-danger-text);border:1px solid var(--ds-danger-border);border-radius:3px;padding:1px 5px;font-size:10px;align-items:center;gap:4px;"
                    >
                      <span>- {decodeEntities(t)}</span>
                      <i class="bi bi-x" style="cursor:pointer;font-size:12px;" onClick={() => removeWithoutTag(t)}></i>
                    </span>
                  )}
                </For>
              </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:4px;">
              <div style="font-size:11px;font-weight:600;color:var(--sys-text-secondary,#555);">
                <i class="bi bi-sort-down"></i> Sort Order:
              </div>
              <select
                class="input-field"
                id="ds-search-sort"
                style="font-size:11px;padding:3px 6px;"
                value={sort()}
                onChange={(ev) => {
                  setSort((ev.target as HTMLSelectElement).value as SearchSort);
                  pane.goToPage(1);
                }}
              >
                <option value="">Best Match</option>
                <option value="name">Alphabetical</option>
                <option value="created_at">Date Added</option>
                <option value="released_on">Release Date</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div id="ds-search-results-area" style="display:flex;flex-direction:column;gap:6px;">
        <Show when={showSpinner() && pane.loading() && pane.error() === undefined}>
          <Loading message="Searching..." />
        </Show>

        <Show when={!pane.loading() && model() !== undefined && pane.error() === undefined}>
          <div
            class="ds-row"
            style="justify-content:space-between;align-items:center;padding:4px 2px;border-bottom:1px solid var(--sys-border-light,#ddd);margin-bottom:6px;"
          >
            <div style="font-size:12px;font-weight:600;">
              <i class="bi bi-list-stars"></i> Search Results
              {model()!.pageData.query ? ` for "${decodeEntities(model()!.pageData.query)}"` : ""}{" "}
              <span class="ds-muted" style="font-weight:normal;font-size:11px;">
                ({model()!.pageData.items.length} items on page {model()!.pageData.currentPage} of{" "}
                {model()!.pageData.totalPages})
              </span>
            </div>
          </div>

          <Show when={model()!.pageData.items.length === 0}>
            <div class="ds-muted" style="padding:24px;text-align:center;">
              <div style="font-size:14px;margin-bottom:4px;">
                <i class="bi bi-search"></i> No matching results found
              </div>
              <div style="font-size:11px;">
                Try adjusting keywords, clearing category filters, or removing excluded tags.
              </div>
            </div>
          </Show>

          <Show when={model()!.pageData.items.length > 0}>
            <Show when={model()!.blMode === "hide" && blacklistedRows().length > 0}>
              <div
                class="ds-row ds-blacklist-notice"
                style="background:var(--ds-warn-bg);border:1px solid var(--ds-warn-border);color:var(--ds-warn-text);border-radius:3px;padding:4px 10px;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:11px;"
              >
                <div class="ds-flex-row">
                  <i class="bi bi-shield-slash-fill" style="color:#dc3545;"></i>
                  <span>
                    <b>{blacklistedRows().length}</b> result{blacklistedRows().length === 1 ? "" : "s"}{" "}
                    hidden by blacklist.
                  </span>
                </div>
                <button
                  type="button"
                  class="win-button ds-btn-sm"
                  onClick={() => setShowHidden(!showHidden())}
                >
                  <i class={`bi bi-${showHidden() ? "eye-slash" : "eye"}`}></i>{" "}
                  {showHidden()
                    ? "Hide Blacklisted"
                    : `Show Blacklisted (${blacklistedRows().length})`}
                </button>
              </div>
              <Show when={showHidden()}>
                <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">
                  <For each={blacklistedRows()}>{renderResultRow}</For>
                </div>
              </Show>
            </Show>

            <Show
              when={model()!.blMode === "hide" && normalRows().length === 0 && blacklistedRows().length > 0}
            >
              <div class="ds-muted" style="padding:12px 0;text-align:center;font-size:11px;">
                All results on this page were hidden by your blacklist.
              </div>
            </Show>

            <Show when={model()!.blMode === "hide" && normalRows().length > 0}>
              <For each={normalRows()}>{renderResultRow}</For>
            </Show>

            <Show when={model()!.blMode === "warn"}>
              <For each={resultRows()}>{renderResultRow}</For>
            </Show>
          </Show>

          <Show when={model()!.pageData.totalPages > 1}>
            <Pager
              totalPages={model()!.pageData.totalPages}
              currentPage={model()!.pageData.currentPage}
              onPage={(p) => pane.goToPage(p)}
              cssText="margin-top:12px;justify-content:flex-end;"
            />
          </Show>
        </Show>

        <Show when={pane.error() !== undefined}>
          <div class="ds-row" style="padding:12px;gap:8px;align-items:center;">
            <span class="ds-muted">Search request failed: {errorMessage()}</span>
            <button type="button" class="win-button" onClick={() => pane.reload()}>
              <i class="bi bi-arrow-clockwise"></i> Retry
            </button>
          </div>
        </Show>
      </div>

      <TriggerWarningModal
        open={warning() !== null}
        title={warning()?.title ?? ""}
        matchedTags={warning()?.matchedTags ?? []}
        onClose={() => setWarning(null)}
        onProceed={warning()?.onProceed ?? (() => {})}
      />
      <AddToCollectionModal
        open={addToCol() !== null}
        item={addToCol()?.item ?? { permalink: "", title: "" }}
        anchorEl={addToCol()?.anchorEl ?? null}
        onClose={() => setAddToCol(null)}
      />
    </div>
  );
}