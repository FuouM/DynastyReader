/**
 * Taggables grid: child series & anthologies associated with the current series/author.
 */

import { For, Show } from "solid-js";
import { decodeEntities, navigate } from "../stores";
import { t } from "../i18n";
import type { Series } from "../types/api";
import { StorageIcon, BookIcon } from "../components/Icon";

export interface SeriesTaggablesProps {
  series: Series;
}

export function SeriesTaggables(props: SeriesTaggablesProps) {
  const taggables = () => props.series.taggables;

  return (
    <Show when={taggables() && taggables()!.length > 0}>
      <div class="group-box" style="margin-top:10px;">
        <div class="group-box-title">
          <StorageIcon /> {t("series.relatedAnthologies", { count: taggables()!.length })}
        </div>
        <div
          style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:6px;margin-top:4px;"
        >
          <For each={taggables()}>
            {(tg) => (
              <div
                class="ds-row"
                style="padding:5px 8px;background:var(--sys-bg-active, #f5f5f5);border:1px solid var(--sys-border-light, #e0e0e0);border-radius:3px;cursor:pointer;align-items:flex-start;gap:6px;"
                title={decodeEntities(tg.name)}
                onClick={() =>
                  navigate({
                    view: "series",
                    seriesPermalink: tg.permalink,
                    seriesName: tg.name,
                  })
                }
              >
                <BookIcon
                  style={{
                    color: "var(--sys-primary,#0078d4)",
                    "margin-top": "1px",
                    "flex-shrink": 0,
                  }}
                />
                <span
                  style="flex:1;min-width:0;line-height:1.3;word-break:break-word;font-size:11px;font-weight:500;"
                >
                  {decodeEntities(tg.name)}
                </span>
                <span class="ds-muted" style="font-size:10px;flex-shrink:0;margin-top:1px;">
                  {tg.type}
                </span>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
