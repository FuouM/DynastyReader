/**
 * Taggables grid: child series & anthologies associated with the current series/author.
 */

import { For, Show } from "solid-js";
import { navigate } from "../stores";
import { decodeEntities } from "../utils/html";
import { t } from "../i18n";
import type { Series } from "../types/api";
import { StorageIcon, BookIcon } from "../components/Icon";
import { IconText } from "../components/Button";
import { GroupBox } from "../components/GroupBox";

export interface SeriesTaggablesProps {
  series: Series;
}

export function SeriesTaggables(props: SeriesTaggablesProps) {
  const taggables = () => props.series.taggables;

  return (
    <Show when={taggables() && taggables()!.length > 0}>
      <GroupBox class="ds-mt-10" title={<IconText icon={<StorageIcon />}>{t("series.relatedAnthologies", { count: taggables()!.length })}</IconText>}>
        <div class="ds-taggables-grid">
          <For each={taggables()}>
            {(tg) => (
              <div
                class="ds-row ds-taggable-card"
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
                  class="ds-taggable-icon"
                />
                <span class="ds-taggable-title">
                  {decodeEntities(tg.name)}
                </span>
                <span class="ds-muted ds-taggable-type">
                  {tg.type}
                </span>
              </div>
            )}
          </For>
        </div>
      </GroupBox>
    </Show>
  );
}
