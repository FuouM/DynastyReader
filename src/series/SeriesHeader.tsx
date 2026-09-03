/**
 * Series header: metadata, categorized tag rows, sanitized description, and cover image.
 */

import { createMemo, Show } from "solid-js";
import { decodeEntities } from "../utils/html";
import { t } from "../i18n";
import { openExternal } from "../api";
import { groupSeriesTags } from "../taxonomy";
import type { GroupedSeriesTags } from "../types/taxonomy";
import type { Series } from "../types/api";
import { TagRow } from "../components/TagRow";
import { Cover } from "../components/Cover";
import { SanitizedDescription } from "../lib/sanitize";
function groupTags(series: Series): GroupedSeriesTags {
  return groupSeriesTags(series.tags, series.taggings);
}


export interface SeriesHeaderProps {
  series: Series;
  coverPath: string | null;
}

export function SeriesHeader(props: SeriesHeaderProps) {
  const tags = createMemo(() => groupTags(props.series));
  const hasMetaRows = createMemo(() => {
    const t = tags();
    return (
      t.authorTags.length > 0 ||
      t.groupTags.length > 0 ||
      t.doujinTags.length > 0 ||
      t.pairingTags.length > 0 ||
      t.characterTags.length > 0 ||
      t.statusTags.length > 0 ||
      t.otherTags.length > 0
    );
  });

  return (
    <div class="ds-series-head">
      <Cover
        path={props.coverPath}
        alt={props.series.name}
        imgClass="ds-cover"
        placeholderClass="ds-cover-placeholder"
      />
      <div class="ds-fill">
        <div class="ds-series-name">{decodeEntities(props.series.name)}</div>
        <div class="ds-muted">{props.series.type ?? "Series"}</div>
        <Show when={props.series.description}>
          <SanitizedDescription html={props.series.description!} />
        </Show>
        <Show when={props.series.link}>
          <div class="ds-series-desc ds-series-desc-p">
            <a
              class="ds-external-link"
              title={props.series.link!}
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                void openExternal(props.series.link!);
              }}
            >
              {t("series.officialSourceLink", { url: props.series.link })}
            </a>
          </div>
        </Show>
        <Show when={hasMetaRows()}>
          <div class="ds-meta-rows">
            <TagRow variant="meta" label={`${t("series.authorsLabel")}:`} tags={tags().authorTags} />
            <TagRow variant="meta" label={`${t("series.scanlatorsLabel")}:`} tags={tags().groupTags} />
            <TagRow variant="meta" label={`${t("series.doujinLabel")}:`} tags={tags().doujinTags} />
            <TagRow variant="meta" label={`${t("series.pairingLabel")}:`} tags={tags().pairingTags} />
            <TagRow variant="meta" label={`${t("series.charactersLabel")}:`} tags={tags().characterTags} />
            <TagRow variant="meta" label={`${t("series.statusLabel")}:`} tags={tags().statusTags} />
            <TagRow variant="meta" label={`${t("series.tagsLabel")}:`} tags={tags().otherTags} />
          </div>
        </Show>
      </div>
    </div>
  );
}
