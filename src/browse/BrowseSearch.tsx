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
import { decodeEntities, navigate, setBanner } from "../stores";
import { t } from "../i18n";
import { searchDynasty, suggest } from "../api";
import {
  getBlacklistMode,
  getFullyCachedChapterPermalinks,
  isItemBlacklisted,
  type BlacklistMode,
} from "../db";
import {
  setPaneError,
  setPaneLoading,
  setTopPagerFor,
  useDelayedSpinner,
  useTabPane,
} from "./browse-state";
import { browseCovers } from "./browse-covers";
import { Pager } from "../components/Pager";
import { Loading } from "../components/Loading";
import { Typeahead } from "../components/Typeahead";
import { ListItem } from "../components/ListItem";
import { WarningChip } from "../components/WarningChip";
import { ExternalLinkButton } from "../components/ExternalLinkButton";
import { BlacklistNotice } from "../components/BlacklistNotice";
import { EmptyState } from "../components/EmptyState";
import { FeedItemRow, type FeedItemData } from "../components/FeedItemRow";
import { useTriggerWarning } from "../components/hooks/useTriggerWarning";
import { useAddToCollection } from "../components/hooks/useAddToCollection";
import type { AddToCollectionItem } from "../components/AddToCollectionModal";
import type {
  SearchClass,
  SearchResultItem,
  SearchResultPage,
  SearchSort,
} from "../types/api";
import {
  EntityIcon,
  SearchIcon,
  ClearIcon,
  CheckIcon,
  RefreshIcon,
  Icon,
} from "../components/Icon";

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

  const isContentKind =
    item.kind === "chapter" ||
    item.kind === "series" ||
    item.kind === "anthology" ||
    item.kind === "doujin" ||
    item.kind === "issue";

  // ── 1. Content items (Series, Chapters, Doujins, Anthologies, Issues) ────────
  if (isContentKind) {
    const itemTags = (item.tags ?? []).map((t) => ({
      type: t.type || "General",
      name: t.name || "",
      permalink: t.permalink || "",
    }));

    if (item.author && !itemTags.some((t) => t.permalink === item.author!.permalink)) {
      itemTags.push({ type: "Author", name: item.author.name, permalink: item.author.permalink });
    }

    if (item.doujin && !itemTags.some((t) => t.permalink === item.doujin!.permalink)) {
      itemTags.push({ type: "Doujin", name: item.doujin.name, permalink: item.doujin.permalink });
    }

    const isSeriesType = item.kind !== "chapter";

    const feedData: FeedItemData = {
      permalink: item.permalink,
      title: item.title,
      kind: item.kind,
      series: isSeriesType ? item.title : item.doujin?.name || null,
      tags: itemTags,
    };

    const extraMeta = (
      <>
        <span
          class="ds-muted"
          style="font-size:10px;background:var(--sys-hover-bg,#eaeaea);padding:1px 5px;border-radius:2px;text-transform:capitalize;"
        >
          {item.kind}
        </span>
        <Show when={item.releasedOn}>
          <span class="ds-muted" style="font-size:11px;">
            · released {item.releasedOn}
          </span>
        </Show>
      </>
    );

    return (
      <FeedItemRow
        item={feedData}
        isBlacklisted={isBlacklisted}
        matchedTags={matchedTags}
        isFullyCached={props.isFullyCached}
        extraMeta={extraMeta}
        onWarn={props.onWarn}
        onAddToCol={props.onAddToCol}
      />
    );
  }

  // ── 2. Taxonomic metadata items (Authors, Scanlators, Tags, Pairings) ────────
  const openTaxonomicItem = (): void => {
    if (item.kind === "tag") {
      navigate({
        view: "browse",
        browseTab: "search",
        withTag: item.title,
      });
    } else {
      navigate({
        view: "series",
        seriesPermalink: item.permalink,
        seriesName: item.title,
      });
    }
  };

  const pathForKind = (kind: string): string => {
    if (kind === "author") return "authors";
    if (kind === "scanlator") return "scanlators";
    if (kind === "pairing") return "pairings";
    return "tags";
  };

  return (
    <ListItem
      class="ds-row"
      cssText="gap:8px;padding:4px 8px;cursor:pointer;min-height:30px;align-items:center;"
      blacklisted={isBlacklisted}
      onClick={openTaxonomicItem}
      leading={
        <div style="font-size:15px;min-width:24px;text-align:center;">
          <EntityIcon kind={item.kind} />
        </div>
      }
      title={
        <div class="ds-flex-row" style="align-items:center;gap:6px;flex-wrap:wrap;">
          <span
            class="ds-item-title"
            style="font-size:12px;font-weight:600;color:var(--sys-text-primary,#000);cursor:pointer;"
          >
            {decodeEntities(item.title)}
          </span>
          <span
            class="ds-muted"
            style="font-size:10px;background:var(--sys-hover-bg,#eaeaea);padding:1px 5px;border-radius:2px;text-transform:capitalize;"
          >
            {item.kind}
          </span>
          <Show when={isBlacklisted && matchedTags.length > 0}>
            <WarningChip mode={props.blMode} tags={matchedTags} />
          </Show>
        </div>
      }
      actions={
        <ExternalLinkButton
          class="ds-btn-xs"
          cssText="flex-shrink:0;"
          title={`Open ${item.kind} "${decodeEntities(item.title)}" on Dynasty Scans`}
          url={`https://dynasty-scans.com/${pathForKind(item.kind)}/${item.permalink}`}
        />
      }
    />
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
  const triggerWarning = useTriggerWarning();
  const addToCol = useAddToCollection();

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
    if (t.searchQuery !== undefined) {
      setQ(t.searchQuery);
      setClasses(new Set<SearchClass>());
      setWithTags([]);
      setWithoutTags([]);
      setSort("");
    }
    if (t.withTag) {
      setQ("");
      setWithoutTags([]);
      setSort("");
      setWithTags([t.withTag]);
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

  let hostEl: HTMLElement | null = null;

  createEffect(() => {
    const model = pane.data();
    if (!model) return;
    setTopPagerFor("search", {
      totalPages: model.pageData.totalPages,
      currentPage: model.pageData.currentPage,
      onPage: (p) => pane.goToPage(p),
    });
    if (hostEl) {
      browseCovers.beginPage(hostEl);
      browseCovers.reobserveUnloadedCovers(hostEl);
    }
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
      onWarn={(title, matchedTags, proceed) => triggerWarning.warn(title, matchedTags, proceed)}
      onAddToCol={addToCol.onAddToCol}
    />
  );

  return (
    <div ref={(el) => { hostEl = el; }}>
      <div class="group-box" style="margin-bottom:8px;padding:8px;">
        <div class="group-box-title">
          <SearchIcon /> In-App Search &amp; Filter
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
                placeholder={t("browse.search.inputPlaceholder")}
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
              <SearchIcon /> {t("browse.search.searchButton")}
            </button>
            <button
              type="button"
              class="win-button"
              id="ds-tab-search-reset"
              title="Reset all search filters"
              onClick={clearAll}
            >
              <ClearIcon /> {t("common.clear")}
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
                  <CheckIcon size={11} />
                </Show>
                <span>{t("browse.search.classesAll")}</span>
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
                        <CheckIcon size={11} />
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
                <Icon name="plus-circle" /> With Tags:
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
                      <Icon name="x" style={{ cursor: "pointer", "font-size": "12px" }} onClick={() => removeWithTag(t)} />
                    </span>
                  )}
                </For>
              </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:4px;">
              <div style="font-size:11px;font-weight:600;color:var(--sys-text-secondary,#555);">
                <Icon name="dash-circle" /> Without Tags (Exclude):
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
                      <Icon name="x" style={{ cursor: "pointer", "font-size": "12px" }} onClick={() => removeWithoutTag(t)} />
                    </span>
                  )}
                </For>
              </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:4px;">
              <div style="font-size:11px;font-weight:600;color:var(--sys-text-secondary,#555);">
                <Icon name="sort-down" /> Sort Order:
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
                <option value="">{t("browse.search.sorts.bestMatch")}</option>
                <option value="name">{t("browse.search.sorts.alphabetical")}</option>
                <option value="created_at">{t("browse.search.sorts.dateAdded")}</option>
                <option value="released_on">{t("browse.search.sorts.releaseDate")}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div id="ds-search-results-area" style="display:flex;flex-direction:column;gap:6px;">
        <Show when={showSpinner() && pane.loading() && pane.error() === undefined}>
          <Loading message={t("browse.search.searching")} />
        </Show>

        <Show when={!pane.loading() && model() !== undefined && pane.error() === undefined}>
          <div
            class="ds-row"
            style="justify-content:space-between;align-items:center;padding:4px 2px;border-bottom:1px solid var(--sys-border-light,#ddd);margin-bottom:6px;"
          >
            <div style="font-size:12px;font-weight:600;">
              <Icon name="list-stars" /> Search Results
              {model()!.pageData.query ? ` for "${decodeEntities(model()!.pageData.query)}"` : ""}{" "}
              <span class="ds-muted" style="font-weight:normal;font-size:11px;">
                ({model()!.pageData.items.length} items on page {model()!.pageData.currentPage} of{" "}
                {model()!.pageData.totalPages})
              </span>
            </div>
          </div>

          <Show when={model()!.pageData.items.length === 0}>
            <EmptyState cssText="padding:24px;text-align:center;">
              <div style="font-size:14px;margin-bottom:4px;">
                <SearchIcon /> No matching results found
              </div>
              <div style="font-size:11px;">
                Try adjusting keywords, clearing category filters, or removing excluded tags.
              </div>
            </EmptyState>
          </Show>

<Show when={model()!.pageData.items.length > 0}>
            <Show when={model()!.blMode === "hide" && blacklistedRows().length > 0}>
              <BlacklistNotice
                count={blacklistedRows().length}
                noun="result"
                showHidden={showHidden()}
                onToggle={() => setShowHidden(!showHidden())}
                cssText="margin-bottom:8px;"
              />
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
              <RefreshIcon /> Retry
            </button>
          </div>
        </Show>
      </div>

      {triggerWarning.host}
      {addToCol.host}
    </div>
  );
}