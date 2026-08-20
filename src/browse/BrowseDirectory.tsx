/**
 * Solid Browse directory pane (Series Directory / Tags). Port of
 * `browse-directory.ts`: alphabetical letter groups, blacklist badges for
 * series, and a bottom pager with the shared top-pager config.
 */

import { createEffect, createSignal, For, Show, type Accessor } from "solid-js";
import { decodeEntities, navigate } from "../stores";
import { directoryGroups, fetchDirectory, openExternal } from "../api";
import { getBlacklistMode, isSeriesBlacklisted, type BlacklistMode } from "../db";
import {
  setPaneLoading,
  setTopPagerFor,
  useDelayedSpinner,
  useTabPane,
} from "./browse-state";
import { Pager } from "../components/Pager";
import { Loading } from "../components/Loading";
import { TriggerWarningModal } from "../components/TriggerWarning";
import type { Directory, DirectoryEntry, DirectoryGroup } from "../types/api";

interface DirectoryModel {
  dir: Directory;
  groups: DirectoryGroup[];
  blMode: BlacklistMode;
}

function DirectoryRow(props: {
  kind: "series" | "tags";
  entry: DirectoryEntry;
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
      void openExternal(`https://dynasty-scans.com/search?q=${encodeURIComponent(props.entry.name)}`);
    }
  };

  return (
    <div
      class="ds-item"
      style="display:flex;align-items:center;justify-content:space-between;padding:3px 6px;"
    >
      <div class="ds-item-title ds-fill ds-clickable" onClick={openEntry}>
        {decodeEntities(props.entry.name)}
        <Show when={isBl}>
          <span
            class="ds-muted"
            style="font-size:10px;margin-left:6px;color:var(--ds-warn-text,#d97706);font-weight:600;"
          >
            <i class="bi bi-shield-slash-fill"></i> Blacklisted
          </span>
        </Show>
      </div>
      <button
        type="button"
        class="win-button ds-btn-xs"
        style="flex-shrink:0;"
        title={props.kind === "series" ? "Open series in browser" : "Search tag in browser"}
        onClick={(ev) => {
          ev.stopPropagation();
          if (props.kind === "series") {
            void openExternal(`https://dynasty-scans.com/series/${props.entry.permalink}`);
          } else {
            void openExternal(
              `https://dynasty-scans.com/search?q=${encodeURIComponent(props.entry.name)}`,
            );
          }
        }}
      >
        <i class="bi bi-box-arrow-up-right"></i>
      </button>
    </div>
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
      const dir = await fetchDirectory(url, key);
      return { dir, groups: directoryGroups(dir), blMode: getBlacklistMode() };
    },
  });
  const showSpinner = useDelayedSpinner(pane.loading);
  const [warning, setWarning] = createSignal<{
    title: string;
    matchedTags: string[];
    onProceed: () => void;
  } | null>(null);

  createEffect(() => setPaneLoading(props.tabId, pane.loading()));

  createEffect(() => {
    const model = pane.data();
    if (!model) return;
    setTopPagerFor(props.tabId, {
      totalPages: model.dir.total_pages,
      currentPage: model.dir.current_page,
      onPage: (p) => pane.goToPage(p),
    });
  });

  const model = (): DirectoryModel | undefined => pane.data();

  return (
    <div>
      <Show when={model() !== undefined && model()!.groups.length > 0}>
        <For each={model()!.groups}>
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
                      onWarn={(title, matchedTags, proceed) =>
                        setWarning({ title, matchedTags, onProceed: proceed })
                      }
                    />
                  )}
                </For>
              </div>
            </>
          )}
        </For>
        <Pager
          totalPages={model()!.dir.total_pages}
          currentPage={model()!.dir.current_page}
          onPage={(p) => pane.goToPage(p)}
        />
      </Show>

      <Show when={model() !== undefined && model()!.groups.length === 0}>
        <div class="ds-muted">No entries on this page.</div>
      </Show>

      <Show when={showSpinner() && model() === undefined}>
        <Loading message="Loading directory..." />
      </Show>

      <TriggerWarningModal
        open={warning() !== null}
        title={warning()?.title ?? ""}
        matchedTags={warning()?.matchedTags ?? []}
        onClose={() => setWarning(null)}
        onProceed={warning()?.onProceed ?? (() => {})}
      />
    </div>
  );
}