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
import { showBanner } from "../stores/topbar";
import { showChapterTags, toggleChapterTags } from "../stores/chapter-tags";
import { decodeEntities, errorMessage } from "../utils/formatting";
import { t } from "../i18n";
import { searchDynasty } from "../api/search";
import { suggest } from "../api/directory";
import { suggestMangaDex } from "./BrowseView";
import { getBlacklistMode, isItemBlacklisted } from "../db/blacklist.repo";
import { activeProvider } from "../stores/provider";
import { MANGADEX_UUID_REGEX } from "../providers/mangadex/api/constants";
import { getTags, searchManga, searchAuthors } from "../providers/mangadex/api/manga";
import { formatMangaTitle, getMangaAuthors, getMangaAuthorEntities } from "../providers/mangadex/mapping";
import { getFullyCachedChapterPermalinks } from "../db/cache.repo";
import type { BlacklistMode } from "../types/blacklist";

const MANGADEX_DOUJIN_TAG = "b13b2a48-c720-44a9-9c77-39c9979373fb";
const MANGADEX_ANTHOLOGY_TAG = "51d83883-4103-437c-b4b1-731cb73d786c";
const MANGADEX_ONESHOT_TAG = "0234a31e-a729-4e28-9d6a-3f87c4966b9e";
import {
  setTopPagerFor,
  useDelayedSpinner,
  useTabPane,
  type BrowsePaneApi,
} from "./browse-state";
import { createSearchFilters } from "./useSearchFilters";
import { browseCovers, coversEnabledSignal } from "./browse-covers";
import { Pager } from "../components/Pager";
import { Loading, EmptyState, ErrorRetryRow } from "../components/Feedback";
import { Typeahead } from "../components/Typeahead";
import { BlacklistNotice } from "../components/Badges";
import { GroupBox } from "../components/GroupBox";
import { DsSelect, IconText, Button } from "../components/Button";
import { SearchResultRow, type SearchRow } from "./SearchResultRow";
import { useTriggerWarning } from "../components/TriggerWarning";
import { useAddToCollection } from "../components/AddToCollectionModal";
import type {
  SearchClass,
  SearchResultItem,
  SearchResultPage,
} from "../types/api";
import {
  SearchIcon,
  ClearIcon,
  CheckIcon,
  Icon,
} from "../components/Icon";
import { log } from "../utils/log";

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
interface SearchModel {
  pageData: SearchResultPage;
  fullyCachedSet: Set<string>;
  blMode: BlacklistMode;
}

export interface BrowseSearchProps {
  active: Accessor<boolean>;
  revision: Accessor<number>;
  transient: { searchQuery?: string; withTag?: string; searchClass?: SearchClass } | null;
  onTransientConsumed: () => void;
  register?: (api: BrowsePaneApi) => void;
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
    load: async (page) => {
      if (activeProvider() === "mangadex") {
        const selClasses = classes();
        if (selClasses.has("Author")) {
          const authorMatches = await searchAuthors(q() || "", 20);
          const items: SearchResultItem[] = authorMatches.map((a) => ({
            kind: "author",
            title: a.attributes.name,
            permalink: `mdx-author:${a.id}`,
            tags: [],
          }));
          const pageData: SearchResultPage = {
            items,
            currentPage: 1,
            totalPages: 1,
            query: q() || "Authors",
          };
          return { pageData, fullyCachedSet: new Set<string>(), blMode: getBlacklistMode() };
        }

        const includedTags: string[] = [];
        const excludedTags: string[] = [];
        const authorIds: string[] = [];

        if (selClasses.has("Doujin")) includedTags.push(MANGADEX_DOUJIN_TAG);
        if (selClasses.has("Anthology")) includedTags.push(MANGADEX_ANTHOLOGY_TAG);
        if (selClasses.has("Chapter")) includedTags.push(MANGADEX_ONESHOT_TAG);

        const currentWith = withTags();
        const currentWithout = withoutTags();

        if (currentWith.length > 0 || currentWithout.length > 0) {
          try {
            const allTags = await getTags();
            const tagMap = new Map<string, string>();
            for (const t of allTags) {
              const enName = t.attributes?.name?.en?.toLowerCase();
              if (enName) tagMap.set(enName, t.id);
              for (const val of Object.values(t.attributes?.name || {})) {
                if (val) tagMap.set(val.toLowerCase(), t.id);
              }
            }
            for (const t of currentWith) {
              const lower = t.toLowerCase();
              if (t.startsWith("mdx-author:")) {
                authorIds.push(t.slice("mdx-author:".length));
              } else if (tagMap.has(lower)) {
                includedTags.push(tagMap.get(lower)!);
              } else if (t.startsWith("mdx-tag:")) {
                includedTags.push(t.slice("mdx-tag:".length));
              } else if (MANGADEX_UUID_REGEX.test(t)) {
                includedTags.push(t);
              } else {
                try {
                  const authorMatches = await searchAuthors(t, 1);
                  if (authorMatches[0]) {
                    authorIds.push(authorMatches[0].id);
                  }
                } catch {}
              }
            }
            for (const t of currentWithout) {
              const lower = t.toLowerCase();
              if (tagMap.has(lower)) {
                excludedTags.push(tagMap.get(lower)!);
              } else if (t.startsWith("mdx-tag:")) {
                excludedTags.push(t.slice("mdx-tag:".length));
              } else if (MANGADEX_UUID_REGEX.test(t)) {
                excludedTags.push(t);
              }
            }
          } catch (e) {
            log.warn("browse-search", "failed to resolve MangaDex tags:", e);
          }
        }

        const currentSort = sort();
        const order: Record<string, "asc" | "desc"> = {};
        if (currentSort === "name") {
          order.title = "asc";
        } else if (currentSort === "created_at") {
          order.createdAt = "desc";
        } else if (currentSort === "released_on") {
          order.latestUploadedChapter = "desc";
        } else if (q()) {
          order.relevance = "desc";
        } else {
          order.latestUploadedChapter = "desc";
        }

        const mdxRes = await searchManga({
          title: q() || undefined,
          includedTags: includedTags.length > 0 ? includedTags : undefined,
          excludedTags: excludedTags.length > 0 ? excludedTags : undefined,
          authorOrArtist: authorIds.length === 1 ? authorIds[0] : undefined,
          authors: authorIds.length > 1 ? authorIds : undefined,
          order,
          limit: 20,
          offset: (page - 1) * 20,
        });
        const totalPages = Math.max(1, Math.ceil((mdxRes.total ?? 0) / 20));
        const items: SearchResultItem[] = (mdxRes.data || []).map((m) => {
          const authorEntities = getMangaAuthorEntities(m);
          const firstAuthor = authorEntities[0];
          const legacyAuthors = getMangaAuthors(m);
          return {
            kind: "series",
            title: formatMangaTitle(m),
            permalink: `mdx:${m.id}`,
            author: firstAuthor
              ? { name: firstAuthor.name, permalink: `mdx-author:${firstAuthor.id}` }
              : (legacyAuthors[0] ? { name: legacyAuthors[0], permalink: `mdx-author:${legacyAuthors[0]}` } : undefined),
            tags: (m.attributes.tags || []).map((t) => ({
              type: "Tag",
              name: t.attributes?.name?.en || t.id,
              permalink: `mdx-tag:${t.id}`,
            })),
          };
        });
        const pageData: SearchResultPage = {
          items,
          currentPage: page,
          totalPages,
          query: q() || currentWith.join(", "),
        };
        return { pageData, fullyCachedSet: new Set<string>(), blMode: getBlacklistMode() };
      }
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
          log.debug("browse-search", "failed to check fully cached chapter permalinks:", cacheCheckErr);
        }
        return { pageData, fullyCachedSet, blMode: getBlacklistMode() };
      } catch (err) {
        const msg = errorMessage(err);
        showBanner(t("browse.search.searchFailedBanner", { msg }));
        throw err;
      }
    },
  });
  props.register?.({ reload: pane.reload, reset: pane.reset });
  const showSpinner = useDelayedSpinner(pane.loading);


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
  const tagSuggest = async (query: string): Promise<Array<{ name: string; type: string }>> => {
    if (activeProvider() === "mangadex") {
      try {
        const allTags = await getTags();
        const qLower = query.toLowerCase().trim();
        const matches: Array<{ name: string; type: string }> = [];
        for (const t of allTags) {
          const name = t.attributes?.name?.en || Object.values(t.attributes?.name || {})[0] || "";
          if (name && (!qLower || name.toLowerCase().includes(qLower))) {
            matches.push({ name, type: "Tag" });
          }
        }
        if (matches.length < 5 && qLower.length >= 2) {
          try {
            const authors = await searchAuthors(qLower, 5);
            for (const a of authors) {
              if (a.attributes?.name && !matches.some((m) => m.name === a.attributes.name)) {
                matches.push({ name: a.attributes.name, type: "Author" });
              }
            }
          } catch {}
        }
        return matches.slice(0, 10);
      } catch {
        return [];
      }
    }
    return suggest(query);
  };

  const [hostEl, setHostEl] = createSignal<HTMLElement | null>(null);

  createEffect(() => {
    const model = pane.data();
    if (!model) return;
    setTopPagerFor("search", {
      totalPages: model.pageData.totalPages,
      currentPage: model.pageData.currentPage,
      onPage: (p) => pane.goToPage(p),
    });
  });

  createEffect(() => {
    const el = hostEl();
    const active = props.active();
    const enabled = coversEnabledSignal();
    const model = pane.data();
    if (!el || !active || !enabled || !model) return;
    browseCovers.beginPage(el);
    browseCovers.reobserveUnloadedCovers(el);
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

  const paneErrorText = (): string => errorMessage(pane.error());

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
    <div ref={setHostEl}>
      <GroupBox
        class="ds-search-panel"
        title={<IconText icon={<SearchIcon />}>{t("browse.search.panelTitle")}</IconText>}
        actions={
          <Button
            className="ds-btn-compact"
            title={showChapterTags() ? t("series.hideTagsTooltip") : t("series.showTagsTooltip")}
            icon={<Icon name="tags" />}
            text={showChapterTags() ? t("series.hideTags") : t("series.showTags")}
            onClick={toggleChapterTags}
          />
        }
      >
        <div class="ds-col">
          <form
            role="search"
            class="ds-flex-row"
            onSubmit={(ev) => {
              ev.preventDefault();
              (document.activeElement as HTMLElement)?.blur();
              runSearch(q());
            }}
          >
            <div class="ds-search-wrap ds-flex-1 ds-relative">
              <Typeahead
                value={q()}
                onInputValue={setQ}
                fetcher={activeProvider() === "mangadex" ? suggestMangaDex : suggest}
                onSelect={(item) => {
                  setQ(item.name);
                  pane.goToPage(1);
                }}
                onEnter={(value) => {
                  (document.activeElement as HTMLElement)?.blur();
                  runSearch(value);
                }}
                placeholder={t("browse.search.inputPlaceholder")}
                debounceMs={SEARCH_TYPEAHEAD_DEBOUNCE_MS}
              />
            </div>
            <Button
              id="ds-tab-search-submit"
              type="submit"
              cssText="font-weight:600;"
              icon={<SearchIcon />}
              text={t("browse.search.searchButton")}
            />
            <Button
              id="ds-tab-search-reset"
              type="button"
              title={t("browse.search.resetFiltersTooltip")}
              icon={<ClearIcon />}
              text={t("common.clear")}
              onClick={clearAll}
            />
          </form>

          <div class="ds-col-4">
            <div class="ds-label-sm">
              {t("browse.search.categoryFilter")}
            </div>
            <div id="ds-search-classes-row" class="ds-row-wrap">
              <Button
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
                    <Button
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
                  fetcher={tagSuggest}
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
                      <Icon name="x" class="ds-chip-remove-icon" onClick={() => removeWithTag(t)} />
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
                  fetcher={tagSuggest}
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
                      <Icon name="x" class="ds-chip-remove-icon" onClick={() => removeWithoutTag(t)} />
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
                aria-label={t("browse.search.sortOrder")}
                className="ds-search-sort"
                value={sort()}
                onChange={(val) => {
                  setSort(val);
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
      </GroupBox>

      <div id="ds-search-results-area" class="ds-stack-6">
        <Show when={showSpinner() && pane.loading() && pane.error() === undefined}>
          <Loading message={t("browse.search.searching")} />
        </Show>

        <Show when={!pane.loading() && model() !== undefined && pane.error() === undefined}>
          <div
            class="ds-row ds-results-header ds-row-between"
          >
            <div class="ds-results-title">
              <IconText icon={<Icon name="list-stars" />}>{t("browse.search.resultsTitle")}</IconText>
              {model()!.pageData.query ? ` ${t("browse.search.resultsFor", { query: decodeEntities(model()!.pageData.query) })}` : ""}{" "}
              <span class="ds-muted ds-results-summary">
                {(() => {
                  const p = model()!.pageData;
                  const pages = { page: p.currentPage, totalPages: p.totalPages };
                  return p.items.length === 1
                    ? t("browse.search.resultsSummarySingle", pages)
                    : t("browse.search.resultsSummary", { count: p.items.length, ...pages });
                })()}
              </span>
            </div>
            <Button
              className="ds-btn-compact"
              title={showChapterTags() ? t("series.hideTagsTooltip") : t("series.showTagsTooltip")}
              icon={<Icon name="tags" />}
              text={showChapterTags() ? t("series.hideTags") : t("series.showTags")}
              onClick={toggleChapterTags}
            />
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
          <ErrorRetryRow
            message={t("browse.search.searchError", { msg: paneErrorText() })}
            onRetry={() => pane.reload()}
          />
        </Show>
      </div>

      {triggerWarning.host}
      {addToCol.host}
    </div>
  );
}
