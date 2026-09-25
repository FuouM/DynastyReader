/**
 * Consolidated SeriesView subcomponents:
 * - SeriesActions: Follow, Add to Collection, Blacklist, and Download buttons
 * - SeriesHeader: Series metadata, categorized tags, description, and cover
 * - SeriesResumeBanner: Resume/Start reading button and progress tracking
 * - SeriesTaggables: Related anthologies and series grid
 */

import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { decodeEntities } from "../utils/formatting";
import { t } from "../i18n";
import { openExternal } from "../api/navigation";
import { navigate } from "../stores/router";
import { groupSeriesTags, type GroupedSeriesTags } from "../taxonomy";
import type { Series } from "../types/api";
import type { SeriesProgressRow } from "../types/db";
import type { ChapterMeta } from "./SeriesChapterList";
import { TagRow } from "../components/TagRow";
import { Cover } from "../components/Cover";
import { SanitizedDescription } from "../lib/sanitize";
import { deleteCached } from "../db/metadata.repo";
import { seriesCoverKey } from "../lib/cache-keys";
import { getSeriesCover } from "../api/series";
import {
  BlacklistIcon,
  BookmarkIcon,
  BookIcon,
  CheckIcon,
  CloudDownloadIcon,
  RefreshIcon,
  StorageIcon,
} from "../components/Icon";
import { Button, AddToCollectionButton, ExternalLinkButton, IconText } from "../components/Button";
import { GroupBox } from "../components/GroupBox";

// ── 1. Series Actions ────────────────────────────────────────────────────────

export interface SeriesActionsProps {
  followed: () => boolean;
  busyFollow: () => boolean;
  onToggleFollow: () => void;
  blacklisted: () => boolean;
  busyBlacklist: () => boolean;
  onToggleBlacklist: () => void;
  onRefresh: () => void;
  onOpenAddToCol: (anchorEl: HTMLElement) => void;
  openUrl: string;
  seriesType?: string;
  onDownloadAll?: () => void;
}

export function SeriesActions(props: SeriesActionsProps) {
  return (
    <>
      <Button
        icon={props.followed() ? <BookmarkIcon filled={true} /> : <BookmarkIcon />}
        text={props.followed() ? t("series.following") : t("series.follow")}
        disabled={props.busyFollow()}
        onClick={props.onToggleFollow}
      />
      <AddToCollectionButton
        text={t("series.addToButton")}
        onOpen={props.onOpenAddToCol}
      />
      <Button
        icon={props.blacklisted() ? <BlacklistIcon filled={true} color="var(--ds-warn-text,#d97706)" /> : <BlacklistIcon />}
        text={props.blacklisted() ? t("series.blacklistedBadge") : t("series.blacklistButton")}
        classList={{ active: props.blacklisted() }}
        title={props.blacklisted() ? t("series.unblacklistTooltip") : t("series.blacklistTooltip")}
        disabled={props.busyBlacklist()}
        onClick={props.onToggleBlacklist}
      />
      <Button
        icon={<RefreshIcon />}
        text={t("common.refresh")}
        title={t("series.reloadTooltip")}
        onClick={props.onRefresh}
      />
      <Show when={props.onDownloadAll}>
        <Button
          icon={<CloudDownloadIcon />}
          text={t("series.downloadAll")}
          title={t("series.downloadAllTooltip")}
          onClick={props.onDownloadAll}
        />
      </Show>
      <Show when={props.openUrl}>
        <ExternalLinkButton
          className="ds-btn-icon"
          style={{ "aspect-ratio": "1 / 1" }}
          title={t("series.openInBrowserTooltip", {
            type: props.seriesType ? props.seriesType.toLowerCase() : "series",
          })}
          url={props.openUrl}
        />
      </Show>
    </>
  );
}

// ── 2. Series Header ─────────────────────────────────────────────────────────

function groupTags(series: Series): GroupedSeriesTags {
  return groupSeriesTags(series.tags, series.taggings);
}

export interface SeriesHeaderProps {
  series: Series;
  coverPath: string | null;
}

export function SeriesHeader(props: SeriesHeaderProps) {
  const [cover, setCover] = createSignal(props.coverPath);
  createEffect(() => setCover(props.coverPath));

  const handleCoverRecover = async () => {
    if (!props.series.cover) return;
    try {
      await deleteCached(seriesCoverKey(props.series.permalink));
      const fresh = await getSeriesCover(props.series.permalink, props.series.cover);
      if (fresh) {
        setCover(fresh);
      }
    } catch {
      // Kept as null/placeholder
    }
  };

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
        path={cover()}
        alt={props.series.name}
        imgClass="ds-cover"
        placeholderClass="ds-cover-placeholder"
        onError={handleCoverRecover}
        onRetry={handleCoverRecover}
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

// ── 3. Series Resume Banner ──────────────────────────────────────────────────

export interface SeriesResumeBannerProps {
  series: Series;
  chapters: ChapterMeta[];
  progress: Map<string, SeriesProgressRow>;
  readHistorySet: Set<string>;
}

export function chronologicalChapters(chapters: ChapterMeta[]): ChapterMeta[] {
  return chapters
    .map((ch, idx) => {
      const ts = ch.released_on ? Date.parse(ch.released_on) : NaN;
      return { ch, idx, ts: Number.isNaN(ts) ? -Infinity : ts };
    })
    .sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.idx - b.idx))
    .map((x) => x.ch);
}

export function SeriesResumeBanner(props: SeriesResumeBannerProps) {
  const resumeInfo = createMemo(() => {
    const chapters = props.chapters;
    if (chapters.length === 0) return null;
    const sorted = chronologicalChapters(chapters);
    const unread = sorted.find(
      (c) =>
        !props.readHistorySet.has(c.permalink) &&
        props.progress.get(c.permalink)?.completed !== 1,
    );
    if (unread) {
      const hasAnyRead = sorted.some(
        (c) =>
          props.readHistorySet.has(c.permalink) ||
          props.progress.get(c.permalink)?.completed === 1,
      );
      return { chapter: unread, isStart: !hasAnyRead, isCompleted: false };
    }
    return { chapter: null, isStart: false, isCompleted: true };
  });

  return (
    <Show when={resumeInfo()}>
      {(info) => (
        <div class="ds-series-resume-banner">
          <Show when={info().chapter}>
            {(ch) => (
              <button
                type="button"
                class="win-button primary ds-series-resume-btn"
                onClick={() => {
                  const prog = props.progress.get(ch().permalink);
                  navigate({
                    view: "reader",
                    seriesPermalink: props.series.permalink,
                    chapterPermalink: ch().permalink,
                    chapterTitle: ch().title,
                    seriesName: props.series.name,
                    chapterList: props.chapters,
                    startPage: prog && prog.completed !== 1 ? prog.page_index : 0,
                  });
                }}
              >
                <span class="ds-resume-icon">▶</span>
                <span>
                  {info().isStart
                    ? t("series.startReading")
                    : t("series.continueReading", {
                        title: decodeEntities(ch().title),
                      })}
                </span>
              </button>
            )}
          </Show>
          <Show when={info().isCompleted}>
            <div class="ds-series-completed-banner ds-muted">
              <CheckIcon size={14} />
              <span>{t("series.allRead")}</span>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}

// ── 4. Series Taggables ──────────────────────────────────────────────────────

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
