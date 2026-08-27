/**
 * Solid Browse in-app Search tab. Port of `browse-search.ts`:
 *
 *  - live search state (query, category filters, with/without tag chips, sort)
 *  - `searchDynasty` results with blacklist split (hide/warn), offline icons,
 *    kind icons, author/doujin links, and add-to-collection quick actions
 *  - typeahead suggestions via `suggest` for the query and tag inputs
 */

const SEARCH_TYPEAHEAD_DEBOUNCE_MS = 250;
const TAG_TYPEAHEAD_DEBOUNCE_MS = 200;

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  type Accessor,
  type JSX,
} from "solid-js";
import { navigate, setBanner, SITE_ROOT } from "../stores";
import { decodeEntities } from "../utils/html";
import { isContentKind, seriesTypeToPath } from "../taxonomy";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
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
import { createSearchFilters } from "./useSearchFilters";
import { browseCovers } from "./browse-covers";
import { Pager } from "../components/Pager";
import { Loading } from "../components/Loading";
import { Typeahead } from "../components/Typeahead";
import { ListItem } from "../components/ListItem";
import { WarningChip } from "../components/WarningChip";
import { ExternalLinkButton } from "../components/ExternalLinkButton";
import { BlacklistNotice } from "../components/BlacklistNotice";
import { EmptyState } from "../components/EmptyState";
import { DsSelect, IconText, IconButton } from "../components/Button";
import { FeedItemRow } from "../components/FeedItemRow";
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

const getAllClasses = (): { id: SearchClass; label: string }[] => [
  { id: "Series", label: t("browse.search.classes.series") },
  { id: "Chapter", label: t("browse.search.classes.chapter") },
  { id: "Anthology", label: t("browse.search.classes.anthology") },
  { id: "Doujin", label: t("browse.search.classes.doujin") },
  { id: "Issue", label: t("browse.search.classes.issue") },
  { id: "Author", label: t("browse.search.classes.author") },
  { id: "Scanlator", label: t("browse.search.classes.scanlator") },
  { id: "General", label: t("browse.search.classes.general") },
  { id: "Pairing", label: t("browse.search.classes.pairing") },
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
  // ── 1. Content items (Series, Chapters, Doujins, Anthologies, Issues) ────────
  if (isContentKind(props.row.item.kind)) {
    const item = () => props.row.item;
    const itemTags = () => {
      const tags = (item().tags ?? []).map((t) => ({
        type: t.type || "General",
        name: t.name || "",
        permalink: t.permalink || "",
      }));
      if (item().author && !tags.some((t) => t.permalink === item().author!.permalink)) {
        tags.push({ type: "Author", name: item().author!.name, permalink: item().author!.permalink });
      }
      if (item().doujin && !tags.some((t) => t.permalink === item().doujin!.permalink)) {
        tags.push({ type: "Doujin", name: item().doujin!.name, permalink: item().doujin!.permalink });
      }
      return tags;
    };

    const feedData = () => ({
      permalink: item().permalink,
      title: item().title,
      kind: item().kind,
      series: item().kind !== "chapter" ? item().title : null,
      tags: itemTags(),
    });

    const extraMeta = (
      <>
        <span class="ds-muted ds-kind-badge">
          {item().kind}
        </span>
        <Show when={item().releasedOn}>
          <span class="ds-muted ds-text-11">
            {t("browse.search.releasedOn", { date: item().releasedOn })}
          </span>
        </Show>
      </>
    );

    return (
      <FeedItemRow
        item={feedData()}
        isBlacklisted={props.row.isBlacklisted}
        matchedTags={props.row.matchedTags}
        isFullyCached={props.isFullyCached}
        extraMeta={extraMeta}
        onWarn={props.onWarn}
        onAddToCol={props.onAddToCol}
      />
    );
  }

  // ── 2. Taxonomic metadata items (Authors, Scanlators, Tags, Pairings) ────────
  const item = () => props.row.item;
  const isBlacklisted = () => props.row.isBlacklisted;
  const matchedTags = () => props.row.matchedTags;

  const openTaxonomicItem = (): void => {
    if (item().kind === "tag") {
      navigate({
        view: "browse",
        browseTab: "search",
        withTag: item().title,
      });
    } else {
      navigate({
        view: "series",
        seriesPermalink: item().permalink,
        seriesName: item().title,
      });
    }
  };

  return (
    <ListItem
      class="ds-row"
      cssText="gap:8px;padding:4px 8px;cursor:pointer;min-height:30px;align-items:center;"
      blacklisted={isBlacklisted()}
      onClick={openTaxonomicItem}
      leading={
        <div class="ds-entity-icon">
          <EntityIcon kind={item().kind} />
        </div>
      }
      title={
        <div class="ds-flex-row ds-search-title-link--row">
          <span
            class="ds-item-title ds-search-title-link"
          >
            {decodeEntities(item().title)}
          </span>
          <span
            class="ds-muted ds-kind-badge"
          >
            {item().kind}
          </span>
          <Show when={isBlacklisted() && matchedTags().length > 0}>
            <WarningChip mode={props.blMode} tags={matchedTags()} />
          </Show>
        </div>
      }
      actions={
        <ExternalLinkButton
          className="ds-btn-icon"
          title={t("browse.search.openExternalTooltip", { kind: item().kind, title: decodeEntities(item().title) })}
          url={`${SITE_ROOT}/${seriesTypeToPath(item().kind)}/${item().permalink}`}
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
  const filters = createSearchFilters();
  const { q, setQ, classes, setClasses, withTags, withoutTags, sort, setSort, withDraft, setWithDraft, withoutDraft, setWithoutDraft } = filters;
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
          const chapterPermalinks = pageData.items
            .filter((it) => it.kind === "chapter")
            .map((it) => it.permalink);
          fullyCachedSet = await getFullyCachedChapterPermalinks(chapterPermalinks);
        } catch (cacheCheckErr) {
          console.debug("[BrowseSearch] failed to check fully cached chapter permalinks:", cacheCheckErr);
        }
        return { pageData, fullyCachedSet, blMode: getBlacklistMode() };
      } catch (err) {
        const msg = errorMessage(err);
        setBanner(t("browse.search.searchFailedBanner", { msg }));
        throw err;
      }
    },
  });
  const showSpinner = useDelayedSpinner(pane.loading);

  createEffect(() => {
    setPaneLoading("search", pane.loading());
    setPaneError("search", pane.error() !== undefined);
  });

  createEffect(() => {
    const t = props.transient;
    if (!t) return;
    filters.applyTransient(t);
    setShowHidden(false);
    pane.goToPage(1);
    props.onTransientConsumed();
  });

  const runSearch = (value: string): void => {
    filters.runSearch(value);
    pane.goToPage(1);
  };

  const toggleClass = (c: SearchClass): void => {
    filters.toggleClass(c);
    pane.goToPage(1);
  };

  const clearAll = (): void => {
    filters.clearAll();
    pane.goToPage(1);
  };

  const addWithTag = (tag: string): void => {
    filters.addWithTag(tag);
    pane.goToPage(1);
  };

  const addWithoutTag = (tag: string): void => {
    filters.addWithoutTag(tag);
    pane.goToPage(1);
  };

  const removeWithTag = (t: string): void => {
    filters.removeWithTag(t);
    pane.goToPage(1);
  };

  const removeWithoutTag = (t: string): void => {
    filters.removeWithoutTag(t);
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

  const paneErrorText = (): string => {
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
      <div class="group-box ds-search-panel">
        <div class="group-box-title">
          <IconText icon={<SearchIcon />}>{t("browse.search.panelTitle")}</IconText>
        </div>
        <div class="ds-col">
          <div class="ds-flex-row">
            <div class="ds-search-wrap ds-flex-1 ds-relative">
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
                debounceMs={SEARCH_TYPEAHEAD_DEBOUNCE_MS}
              />
            </div>
            <IconButton
              id="ds-tab-search-submit"
              cssText="font-weight:600;"
              icon={<SearchIcon />}
              text={t("browse.search.searchButton")}
              onClick={() => runSearch(q())}
            />
            <IconButton
              id="ds-tab-search-reset"
              title={t("browse.search.resetFiltersTooltip")}
              icon={<ClearIcon />}
              text={t("common.clear")}
              onClick={clearAll}
            />
          </div>

          <div class="ds-col-4">
            <div class="ds-label-sm">
              {t("browse.search.categoryFilter")}
            </div>
            <div id="ds-search-classes-row" class="ds-row-wrap">
              <IconButton
                className={`ds-btn-xs${classes().size === 0 ? " active" : ""}`}
                onClick={() => {
                  setClasses(new Set<SearchClass>());
                  pane.goToPage(1);
                }}
                icon={classes().size === 0 ? <CheckIcon size={11} /> : undefined}
                text={t("browse.search.classesAll")}
              />
              <For each={getAllClasses()}>
                {(c) => {
                  const isActive = () => classes().has(c.id);
                  return (
                    <IconButton
                      className={`ds-btn-xs${isActive() ? " active" : ""}`}
                      onClick={() => toggleClass(c.id)}
                      icon={isActive() ? <CheckIcon size={11} /> : undefined}
                      text={c.label}
                    />
                  );
                }}
              </For>
            </div>
          </div>

          <div
            class="ds-search-grid"
          >
            <div class="ds-col-4">
              <div class="ds-label-sm">
                <IconText icon={<Icon name="plus-circle" />}>{t("browse.search.withTags")}</IconText>
              </div>
              <div class="ds-relative">
                <Typeahead
                  value={withDraft()}
                  onInputValue={setWithDraft}
                  fetcher={suggest}
                  onSelect={(item) => addWithTag(item.name)}
                  onEnter={(value) => addWithTag(value)}
                  placeholder={t("browse.search.withTagsPlaceholder")}
                  maxItems={6}
                  debounceMs={TAG_TYPEAHEAD_DEBOUNCE_MS}
                />
              </div>
              <div id="ds-search-with-chips" class="ds-chip-container">
                <For each={withTags()}>
                  {(t) => (
                    <span
                      class="ds-row ds-chip ds-chip-primary"
                    >
                      <span>+ {decodeEntities(t)}</span>
                      <Icon name="x" style={{ cursor: "pointer", "font-size": "12px" }} onClick={() => removeWithTag(t)} />
                    </span>
                  )}
                </For>
              </div>
            </div>

            <div class="ds-col-4">
              <div class="ds-label-sm">
                <IconText icon={<Icon name="dash-circle" />}>{t("browse.search.withoutTags")}</IconText>
              </div>
              <div class="ds-relative">
                <Typeahead
                  value={withoutDraft()}
                  onInputValue={setWithoutDraft}
                  fetcher={suggest}
                  onSelect={(item) => addWithoutTag(item.name)}
                  onEnter={(value) => addWithoutTag(value)}
                  placeholder={t("browse.search.withoutTagsPlaceholder")}
                  maxItems={6}
                  debounceMs={TAG_TYPEAHEAD_DEBOUNCE_MS}
                />
              </div>
              <div id="ds-search-without-chips" class="ds-chip-container">
                <For each={withoutTags()}>
                  {(t) => (
                    <span
                      class="ds-row ds-chip ds-chip-danger"
                    >
                      <span>- {decodeEntities(t)}</span>
                      <Icon name="x" style={{ cursor: "pointer", "font-size": "12px" }} onClick={() => removeWithoutTag(t)} />
                    </span>
                  )}
                </For>
              </div>
            </div>

            <div class="ds-col-4">
              <div class="ds-label-sm">
                <IconText icon={<Icon name="sort-down" />}>{t("browse.search.sortOrder")}</IconText>
              </div>
              <DsSelect
                id="ds-search-sort"
                className="ds-search-sort"
                value={sort()}
                onChange={(val) => {
                  setSort(val as SearchSort);
                  pane.goToPage(1);
                }}
                options={[
                  { value: "", label: t("browse.search.sorts.bestMatch") },
                  { value: "name", label: t("browse.search.sorts.alphabetical") },
                  { value: "created_at", label: t("browse.search.sorts.dateAdded") },
                  { value: "released_on", label: t("browse.search.sorts.releaseDate") },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <div id="ds-search-results-area" class="ds-stack-6">
        <Show when={showSpinner() && pane.loading() && pane.error() === undefined}>
          <Loading message={t("browse.search.searching")} />
        </Show>

        <Show when={!pane.loading() && model() !== undefined && pane.error() === undefined}>
          <div
            class="ds-row ds-results-header"
          >
            <div class="ds-results-title">
              <IconText icon={<Icon name="list-stars" />}>{t("browse.search.resultsTitle")}</IconText>
              {model()!.pageData.query ? ` ${t("browse.search.resultsFor", { query: decodeEntities(model()!.pageData.query) })}` : ""}{" "}
              <span class="ds-muted ds-results-summary">
                {t("browse.search.resultsSummary", {
                  count: model()!.pageData.items.length,
                  page: model()!.pageData.currentPage,
                  totalPages: model()!.pageData.totalPages,
                })}
              </span>
            </div>
          </div>

          <Show when={model()!.pageData.items.length === 0}>
            <EmptyState cssText="padding:24px;text-align:center;">
              <div class="ds-empty-title">
                <IconText icon={<SearchIcon />}>{t("browse.search.noResults")}</IconText>
              </div>
              <div class="ds-text-11">
                {t("browse.search.noResultsHint")}
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
                <div class="ds-stack-6 ds-mb-8">
                  <For each={blacklistedRows()}>{renderResultRow}</For>
                </div>
              </Show>
            </Show>

            <Show
              when={(model()!.blMode === "hide" || model()!.blMode === "ghost") && normalRows().length === 0 && blacklistedRows().length > 0}
            >
              <div class="ds-muted ds-empty-muted">
                {t("browse.search.emptyBlacklist")}
              </div>
            </Show>

            <Show when={(model()!.blMode === "hide" || model()!.blMode === "ghost") && normalRows().length > 0}>
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
          <div class="ds-row ds-error-row">
            <span class="ds-muted">{t("browse.search.searchError", { msg: paneErrorText() })}</span>
            <IconButton
              icon={<RefreshIcon />}
              text={t("common.retry")}
              onClick={() => pane.reload()}
            />
          </div>
        </Show>
      </div>

      {triggerWarning.host}
      {addToCol.host}
    </div>
  );
}