/**
 * Solid Browse directory pane (Series Directory / Tags). Port of
 * `browse-directory.ts`: alphabetical letter groups, blacklist badges for
 * series, and a bottom pager with the shared top-pager config.
 */

import { createEffect, createMemo, createResource, createSignal, For, Show, type Accessor } from "solid-js";
import { decodeEntities, navigate } from "../stores";
import { directoryGroups, fetchDirectory, searchAllDirectoryEntries, syncAllDirectoryPages } from "../api";
import { getBlacklistMode, isSeriesBlacklisted, type BlacklistMode } from "../db";
import {
  setPaneLoading,
  setTopPagerFor,
  useDelayedSpinner,
  useTabPane,
} from "./browse-state";
import { Pager } from "../components/Pager";
import { Loading } from "../components/Loading";
import { InputField } from "../components/InputField";
import { ListItem } from "../components/ListItem";
import { EmptyState } from "../components/EmptyState";
import { BlacklistIcon } from "../components/Icon";
import { ExternalLinkButton } from "../components/ExternalLinkButton";
import { useTriggerWarning } from "../components/hooks/useTriggerWarning";
import type { Directory, DirectoryGroup } from "../types/api";

interface DirectoryModel {
  dir: Directory;
  groups: DirectoryGroup[];
  blMode: BlacklistMode;
}

function DirectoryRow(props: {
  kind: "series" | "tags";
  entry: { name: string; permalink: string };
  blMode: BlacklistMode;
  onWarn: (title: string, matchedTags: string[], proceed: () => void) => void;
}) {
  const isBl = props.kind === "series" && isSeriesBlacklisted(props.entry.permalink, props.entry.name);

  const openEntry = (): void => {
    if (props.kind === "series") {
      const openSeries = () =>
        navigate({
          view: "series",
          seriesPermalink: props.entry.permalink,
          seriesName: props.entry.name,
        });
      if (isBl && props.blMode === "warn") {
        props.onWarn(props.entry.name, [props.entry.name], openSeries);
      } else {
        openSeries();
      }
    } else {
      navigate({
        view: "browse",
        browseTab: "search",
        withTag: props.entry.name,
      });
    }
  };

  return (
    <ListItem
      cssText="justify-content:space-between;padding:3px 6px;cursor:pointer;"
      onClick={openEntry}
      title={
        <span class="ds-item-title" style="display:inline-flex;align-items:center;gap:6px;">
          {decodeEntities(props.entry.name)}
          <Show when={isBl}>
            <span
              class="ds-muted"
              style="font-size:10px;margin-left:6px;color:var(--ds-warn-text,#d97706);font-weight:600;"
            >
              <BlacklistIcon filled={true} /> Blacklisted
            </span>
          </Show>
        </span>
      }
      actions={
        <ExternalLinkButton
          class="ds-btn-xs"
          cssText="flex-shrink:0;"
          title={props.kind === "series" ? "Open series in browser" : "Search tag in browser"}
          url={
            props.kind === "series"
              ? `https://dynasty-scans.com/series/${props.entry.permalink}`
              : `https://dynasty-scans.com/search?q=${encodeURIComponent(props.entry.name)}`
          }
        />
      }
    />
  );
}

export interface BrowseDirectoryProps {
  kind: "series" | "tags";
  tabId: string;
  active: Accessor<boolean>;
  revision: Accessor<number>;
  forceTick: Accessor<number>;
}

export function BrowseDirectory(props: BrowseDirectoryProps) {
  const pane = useTabPane<DirectoryModel>({
    active: props.active,
    revision: props.revision,
    forceTick: props.forceTick,
    load: async (page) => {
      const url = props.kind === "series" ? `/series.json?page=${page}` : `/tags.json?page=${page}`;
      const key = `${props.kind === "series" ? "dir:series" : "dir:tags"}:${page}`;
      const dir = await fetchDirectory(url, key, props.kind);
      return { dir, groups: directoryGroups(dir), blMode: getBlacklistMode() };
    },
  });
  const showSpinner = useDelayedSpinner(pane.loading);
  const [query, setQuery] = createSignal("");
  const triggerWarning = useTriggerWarning();

  createEffect(() => setPaneLoading(props.tabId, pane.loading()));

  const model = (): DirectoryModel | undefined => pane.data();

  createEffect(() => {
    const m = model();
    if (!m) return;
    const isSearching = query().trim().length > 0;
    if (isSearching) {
      setTopPagerFor(props.tabId, {
        totalPages: 1,
        currentPage: 1,
        onPage: () => {},
      });
    } else {
      setTopPagerFor(props.tabId, {
        totalPages: m.dir.total_pages,
        currentPage: m.dir.current_page,
        onPage: (p) => {
          pane.goToPage(p);
        },
      });
    }

    // Eagerly background-sync all directory pages into SQLite so search covers all 17+ pages
    if (m.dir.total_pages > 1) {
      void syncAllDirectoryPages(props.kind, m.dir.total_pages);
    }
  });

  const [sqlSearchResults] = createResource(
    () => ({ q: query().trim(), kind: props.kind, active: props.active(), rev: props.revision() }),
    async ({ q, kind, active }) => {
      if (!active || !q) return null;
      return searchAllDirectoryEntries(kind, q);
    },
  );

  const displayGroups = createMemo<DirectoryGroup[]>(() => {
    const q = query().trim().toLowerCase();
    if (!q) {
      const m = model();
      return m ? m.groups : [];
    }

    // Direct SQL search result
    const sqlRes = sqlSearchResults();
    if (sqlRes !== null && sqlRes !== undefined) {
      return sqlRes;
    }

    return [];
  });

  const totalFilteredEntries = createMemo<number>(() =>
    displayGroups().reduce((acc, g) => acc + g.entries.length, 0),
  );

  return (
    <div>
      <div style="margin-bottom:8px;">
        <InputField
          placeholder={props.kind === "series" ? "Filter series in directory…" : "Filter tags in directory…"}
          value={query()}
          onInput={setQuery}
          onClear={() => setQuery("")}
        />
      </div>

      <Show when={model() !== undefined && displayGroups().length > 0}>
        <Show when={query().trim().length > 0}>
          <div class="ds-muted" style="font-size:11px;margin-bottom:6px;padding:0 2px;">
            Showing {totalFilteredEntries()} matching {props.kind === "series" ? "series" : "tags"} across all cached pages
          </div>
        </Show>

        <For each={displayGroups()}>
          {(group) => (
            <>
              <div class="ds-vol-header">{group.letter}</div>
              <div style="display:flex;flex-direction:column;">
                <For each={group.entries}>
                  {(entry) => (
                    <DirectoryRow
                      kind={props.kind}
                      entry={entry}
                      blMode={model()!.blMode}
                      onWarn={(title, matchedTags, proceed) => triggerWarning.warn(title, matchedTags, proceed)}
                    />
                  )}
                </For>
              </div>
            </>
          )}
        </For>
        <Show when={query().trim().length === 0}>
          <div style="display:flex;justify-content:flex-end;margin-top:8px;">
            <Pager
              totalPages={model()!.dir.total_pages}
              currentPage={model()!.dir.current_page}
              onPage={(p) => pane.goToPage(p)}
              cssText="justify-content:flex-end;margin:0;"
            />
          </div>
        </Show>
      </Show>

      <Show when={model() !== undefined && displayGroups().length === 0 && model()!.groups.length > 0}>
        <EmptyState
          cssText="padding:24px;text-align:center;"
          iconName="search"
          iconCssText="font-size:24px;opacity:0.6;display:block;margin-bottom:8px;"
        >
          <span class="ds-muted">
            No {props.kind === "series" ? "series" : "tags"} match "{query()}".
          </span>
        </EmptyState>
      </Show>

      <Show when={model() !== undefined && model()!.groups.length === 0}>
        <div class="ds-muted">No entries on this page.</div>
      </Show>

      <Show when={showSpinner() && model() === undefined}>
        <Loading message="Loading directory..." />
      </Show>

      {triggerWarning.host}
    </div>
  );
}