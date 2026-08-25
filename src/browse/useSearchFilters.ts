import { createSignal, type Accessor, type Setter } from "solid-js";
import type { SearchClass, SearchSort } from "../types/api";

export interface SearchFilters {
  q: Accessor<string>;
  setQ: Setter<string>;
  classes: Accessor<Set<SearchClass>>;
  setClasses: Setter<Set<SearchClass>>;
  withTags: Accessor<string[]>;
  setWithTags: Setter<string[]>;
  withoutTags: Accessor<string[]>;
  setWithoutTags: Setter<string[]>;
  sort: Accessor<SearchSort>;
  setSort: Setter<SearchSort>;
  withDraft: Accessor<string>;
  setWithDraft: Setter<string>;
  withoutDraft: Accessor<string>;
  setWithoutDraft: Setter<string>;
  runSearch: (value: string) => void;
  toggleClass: (c: SearchClass) => void;
  clearAll: () => void;
  applyTransient: (t: { searchQuery?: string; withTag?: string; searchClass?: string } | null) => void;
  addWithTag: (tag: string) => void;
  addWithoutTag: (tag: string) => void;
  removeWithTag: (tag: string) => void;
  removeWithoutTag: (tag: string) => void;
}

/**
 * Encapsulates the filter state for BrowseSearch (q, classes, with/without tags, sort).
 * Deduplicates the paired `withTags` / `withoutTags` add/remove logic that was
 * copy-pasted in `BrowseSearch.tsx`. Caller is responsible for triggering
 * `pane.goToPage(1)` after mutations (avoids circular `pane` dependency).
 */
export function createSearchFilters(): SearchFilters {
  const [q, setQ] = createSignal("");
  const [classes, setClasses] = createSignal<Set<SearchClass>>(new Set());
  const [withTags, setWithTags] = createSignal<string[]>([]);
  const [withoutTags, setWithoutTags] = createSignal<string[]>([]);
  const [sort, setSort] = createSignal<SearchSort>("");
  const [withDraft, setWithDraft] = createSignal("");
  const [withoutDraft, setWithoutDraft] = createSignal("");

  const runSearch = (value: string): void => {
    setQ(value.trim());
  };

  const toggleClass = (c: SearchClass): void => {
    setClasses((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const clearAll = (): void => {
    setQ("");
    setClasses(new Set<SearchClass>());
    setWithTags([]);
    setWithoutTags([]);
    setSort("");
  };

  const applyTransient = (t: {
    searchQuery?: string;
    withTag?: string;
    searchClass?: string;
  } | null): void => {
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
  };

  const addWithTag = (tag: string): void => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (!withTags().includes(trimmed)) setWithTags((tags) => [...tags, trimmed]);
    setWithDraft("");
  };

  const addWithoutTag = (tag: string): void => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (!withoutTags().includes(trimmed)) setWithoutTags((tags) => [...tags, trimmed]);
    setWithoutDraft("");
  };

  const removeWithTag = (tag: string): void => {
    setWithTags((tags) => tags.filter((x) => x !== tag));
  };

  const removeWithoutTag = (tag: string): void => {
    setWithoutTags((tags) => tags.filter((x) => x !== tag));
  };

  return {
    q,
    setQ,
    classes,
    setClasses,
    withTags,
    setWithTags,
    withoutTags,
    setWithoutTags,
    sort,
    setSort,
    withDraft,
    setWithDraft,
    withoutDraft,
    setWithoutDraft,
    runSearch,
    toggleClass,
    clearAll,
    applyTransient,
    addWithTag,
    addWithoutTag,
    removeWithTag,
    removeWithoutTag,
  };
}
