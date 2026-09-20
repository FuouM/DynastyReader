/**
 * Solid Series Blacklist view. Port of `ui-blacklist.ts`:
 *  - blacklist behavior mode switch (hide / trigger warning)
 *  - blacklisted series list with navigate / open-external / remove
 */

import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js";
import { navigate } from "../stores/router";
import { setActions, showBanner } from "../stores/topbar";
import { decodeEntities, formatDate, dynastyUrl, errorMessage } from "../utils/formatting";
import { t } from "../i18n";
import { getBlacklistMode, getBlacklistedSeries, removeBlacklistedSeries, setBlacklistMode } from "../db/blacklist.repo";
import type { BlacklistedSeries, BlacklistMode } from "../types/blacklist";
import { useDelayedSpinner } from "../browse/browse-state";
import {
  BlacklistIcon,
  ListCheckIcon,
  TrashIcon,
} from "../components/Icon";
import { SubTabs } from "../components/SubTabs";
import { TagPill } from "../components/TagRow";
import { CheckIcon, SearchIcon } from "../components/Icon";
import {
  whitelistEnabled,
  setWhitelistEnabled,
  whitelistedTags,
  addWhitelistedTag,
  removeWhitelistedTag,
  type WhitelistTag,
} from "../providers/mangadex/db/whitelist.repo";
import { getTags } from "../providers/mangadex/api/manga";
import { GIRLS_LOVE_TAG_ID } from "../providers/mangadex/api/constants";
import type { MangaDexTag } from "../providers/mangadex/types";

const POPULAR_GENRES: WhitelistTag[] = [
  { id: GIRLS_LOVE_TAG_ID, name: "Girls' Love" },
  { id: "423e2eae-a7a2-4a8b-ac03-a8351462d71d", name: "Romance" },
  { id: "e5301a23-ebd9-49dd-a0cb-2add944c77ec", name: "Slice of Life" },
  { id: "4d32cc48-9f00-4cca-9b5a-a839f0764984", name: "Comedy" },
  { id: "b9af3a63-f058-464f-a929-e027557e04b5", name: "Drama" },
  { id: "cdc58593-87dd-415e-bbc0-2ec27bf404cc", name: "Fantasy" },
  { id: "caaa44eb-cd40-4177-b930-79d3ef21f05e", name: "School Life" },
  { id: "eabc5b52-d13c-49c7-9516-3ab3d60065f6", name: "Supernatural" },
  { id: "ee963ce2-acaa-43e9-a0fe-0f0460e60401", name: "Mystery" },
  { id: "256c8bd9-4904-4360-bf4f-508a76d67183", name: "Sci-Fi" },
];
import { Loading, ErrorRetryRow } from "../components/Feedback";
import { ListItem } from "../components/ListItem";
import { Button, IconText, BackRefreshActions, ExternalLinkButton, BlacklistModeSwitch } from "../components/Button";
import { GroupBox } from "../components/GroupBox";
export function BlacklistView(props: { initialTab?: "blacklist" | "whitelist" }) {
  const [activeTab, setActiveTab] = createSignal<"blacklist" | "whitelist">(
    props.initialTab ?? "blacklist",
  );
  const [searchQuery, setSearchQuery] = createSignal("");
  const [allTagsResource] = createResource<MangaDexTag[]>(getTags);

  const isTagWhitelisted = (tagId: string): boolean => {
    return whitelistedTags().some((t) => t.id === tagId);
  };

  const togglePopularGenre = (genre: WhitelistTag): void => {
    if (isTagWhitelisted(genre.id)) {
      removeWhitelistedTag(genre.id);
      showBanner(`Removed "${genre.name}" from allowlist`);
    } else {
      addWhitelistedTag(genre);
      showBanner(`Added "${genre.name}" to allowlist`);
    }
  };

  const filteredMangaDexTags = createMemo(() => {
    const q = searchQuery().trim().toLowerCase();
    if (!q) return [];
    const tags = allTagsResource() || [];
    return tags
      .filter((t) => {
        const name = (t.attributes?.name?.en || "").toLowerCase();
        return name.includes(q);
      })
      .slice(0, 15);
  });
  const [data, { refetch }] = createResource<BlacklistedSeries[]>(() =>
    getBlacklistedSeries(),
  );
  const showSpinner = useDelayedSpinner(() => data.loading);
  const [mode, setMode] = createSignal<BlacklistMode>(getBlacklistMode());

  const changeMode = (next: BlacklistMode): void => {
    setMode(next);
    setBlacklistMode(next);
    const modeLabel = next === "hide" ? t("blacklist.modeChangedHide") : next === "ghost" ? t("blacklist.modeChangedGhost") : t("blacklist.modeChangedWarn");
    showBanner(
      t("blacklist.modeChangedBanner", {
        mode: modeLabel,
      }),
    );
  };

  const removeSeries = async (item: BlacklistedSeries): Promise<void> => {
    await removeBlacklistedSeries(item.series_permalink);
    showBanner(t("blacklist.removedSeriesBanner", { name: item.series_name }));
    void refetch();
  };

  createEffect(() => {
    if (data() === undefined) return;
    setActions(
      <BackRefreshActions
        backLabel={t("blacklist.backToLibrary")}
        onBack={() => navigate({ view: "library" })}
        onRefresh={() => void refetch()}
      />,
    );
  });

  const errorText = (): string => errorMessage(data.error);

  return (
    <div
      id="ds-blacklist-view-container"
      class="ds-bl-view"
    >
      <div style="margin-bottom: 12px;">
        <SubTabs
          tabs={[
            { id: "blacklist", label: "Series Blacklist", shortLabel: "Blacklist" },
            { id: "whitelist", label: "Feed Allowlist", shortLabel: "Allowlist" },
          ]}
          activeTab={activeTab()}
          onSwitch={(id) => setActiveTab(id as "blacklist" | "whitelist")}
        />
      </div>
      <Show when={activeTab() === "blacklist"}>
      <Show
        when={data() !== undefined}
        fallback={
          <>
            <Show when={showSpinner()}>
              <Loading />
            </Show>
            <Show when={data.error !== undefined && data() === undefined}>
              <ErrorRetryRow
                message={t("blacklist.loadError", { msg: errorText() })}
                onRetry={() => void refetch()}
                className="ds-bl-error-row"
              />
            </Show>
          </>
        }
      >
        <GroupBox
          title={<IconText icon={<BlacklistIcon filled={false} />}>{t("blacklist.title")}</IconText>}
        >
          <div class="ds-stack-8">
            <div class="ds-muted">
              {t("blacklist.description")}
            </div>
            <BlacklistModeSwitch
              id="ds-bl-mode-switch-view"
              value={mode}
              onChange={changeMode}
            />
          </div>
        </GroupBox>

        <GroupBox
          title={<IconText icon={<ListCheckIcon />}>{t("blacklist.seriesTitle", { count: data()!.length })}</IconText>}
        >

          <Show
            when={data()!.length > 0}
            fallback={
              <div class="ds-bl-empty">
                <BlacklistIcon
                  filled={false}
                  class="ds-bl-empty-icon"
                />
                {t("blacklist.emptySeriesTitle")}
                <br />
                <span class="ds-muted">
                  {t("blacklist.emptySeriesHint")}
                </span>
              </div>
            }
          >
            <div class="ds-bl-series-list">
              <For each={data()!}>
                {(item) => (
                  <ListItem
                    class="ds-bl-series-item"
                    leading={
                      <BlacklistIcon
                        filled={true}
                        class="ds-bl-series-icon"
                      />
                    }
                    title={
                      <div
                        class="ds-item-title ds-clickable ds-truncate"
                        onClick={() =>
                          navigate({
                            view: "series",
                            seriesPermalink: item.series_permalink,
                            seriesName: item.series_name,
                          })
                        }
                      >
                        {decodeEntities(item.series_name)}
                      </div>
                    }
                    body={
                      <div class="ds-muted ds-bl-series-meta">
                        <span class="ds-etag-tag">{item.series_permalink}</span>
                        <span>{t("blacklist.blacklistedOn", { date: formatDate(item.created_at) })}</span>
                      </div>
                    }
                    actions={
                      <>
                        <ExternalLinkButton
                          className="ds-btn-icon"
                          title={t("blacklist.openOnDynastyTooltip")}
                          url={dynastyUrl("series", item.series_permalink)}
                        />
                        <Button
                          icon={<TrashIcon />}
                          className="ds-btn-sm"
                          title={t("blacklist.removeSeriesTooltip")}
                          onClick={() => void removeSeries(item)}
                        />
                      </>
                    }
                  />
                )}
              </For>
            </div>
          </Show>
        </GroupBox>
      </Show>
      </Show>
      <Show when={activeTab() === "whitelist"}>
        {/* 1. Configuration & Mode Switch */}
        <GroupBox
          title={
            <IconText icon={<ListCheckIcon />}>
              Feed Allowlist (Whitelist)
            </IconText>
          }
        >
          <div class="ds-stack-8">
            <div class="ds-muted">
              Filters MangaDex feeds (Recent Releases, Recently Added) to only include series matching allowed tags/genres.
              When disabled, all releases across all MangaDex genres are displayed.
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <Button
                className={whitelistEnabled() ? "win-button--active" : ""}
                icon={whitelistEnabled() ? <CheckIcon /> : undefined}
                text={whitelistEnabled() ? "Allowlist Filtering: Enabled" : "Allowlist Filtering: Disabled"}
                onClick={() => {
                  const next = !whitelistEnabled();
                  setWhitelistEnabled(next);
                  showBanner(next ? "Allowlist filtering enabled" : "Allowlist filtering disabled");
                }}
              />
            </div>
          </div>
        </GroupBox>

        {/* 2. Active Whitelisted Tags */}
        <GroupBox
          title={
            <IconText icon={<ListCheckIcon />}>
              {`Allowed Tags & Genres (${whitelistedTags().length})`}
            </IconText>
          }
        >
          <Show
            when={whitelistedTags().length > 0}
            fallback={
              <div class="ds-bl-empty">
                No tags in allowlist.
                <br />
                <span class="ds-muted">
                  Add tags below to filter feeds, or disable allowlist filtering to view all releases.
                </span>
              </div>
            }
          >
            <div class="ds-bl-series-list">
              <For each={whitelistedTags()}>
                {(tag) => (
                  <ListItem
                    class="ds-bl-series-item"
                    leading={<TagPill name={tag.name} type="tag" />}
                    title={<div class="ds-item-title ds-truncate">{tag.name}</div>}
                    body={<div class="ds-muted ds-bl-series-meta"><span>{tag.id}</span></div>}
                    actions={
                      <Button
                        icon={<TrashIcon />}
                        className="ds-btn-sm"
                        title={`Remove "${tag.name}" from allowlist`}
                        onClick={() => {
                          removeWhitelistedTag(tag.id);
                          showBanner(`Removed "${tag.name}" from allowlist`);
                        }}
                      />
                    }
                  />
                )}
              </For>
            </div>
          </Show>
        </GroupBox>

        {/* 3. Quick-Add Common Genres */}
        <GroupBox title="Quick-Add Popular Genres">
          <div class="ds-stack-8">
            <div class="ds-muted">
              Click any genre to toggle it in your feed allowlist:
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              <For each={POPULAR_GENRES}>
                {(genre) => {
                  const active = () => isTagWhitelisted(genre.id);
                  return (
                    <Button
                      className={active() ? "win-button--active" : ""}
                      icon={active() ? <CheckIcon /> : undefined}
                      text={genre.name}
                      onClick={() => togglePopularGenre(genre)}
                    />
                  );
                }}
              </For>
            </div>
          </div>
        </GroupBox>

        {/* 4. Search All Official MangaDex Tags */}
        <GroupBox title="Search & Add Other Tags">
          <div class="ds-stack-8">
            <div style="display: flex; gap: 6px; align-items: center;">
              <SearchIcon />
              <input
                type="text"
                class="win-input"
                style="flex: 1; height: 26px; padding: 0 8px;"
                placeholder="Search MangaDex tags (e.g. Yuri, Isekai, Villainess, Mecha)..."
                value={searchQuery()}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
              />
            </div>

            <Show when={allTagsResource.loading}>
              <Loading />
            </Show>

            <Show when={filteredMangaDexTags().length > 0}>
              <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
                <For each={filteredMangaDexTags()}>
                  {(tag) => {
                    const name = tag.attributes?.name?.en || tag.id;
                    const active = () => isTagWhitelisted(tag.id);
                    return (
                      <div
                        style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border: 1px solid var(--ds-border); background: var(--ds-surface);"
                      >
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <TagPill name={name} type="tag" />
                          <span class="ds-muted" style="font-size: 11px;">
                            {tag.attributes?.group || "tag"}
                          </span>
                        </div>
                        <Button
                          className={active() ? "win-button--active" : ""}
                          icon={active() ? <CheckIcon /> : undefined}
                          text={active() ? "Allowed" : "Add to Allowlist"}
                          onClick={() => {
                            if (active()) {
                              removeWhitelistedTag(tag.id);
                              showBanner(`Removed "${name}" from allowlist`);
                            } else {
                              addWhitelistedTag({ id: tag.id, name });
                              showBanner(`Added "${name}" to allowlist`);
                            }
                          }}
                        />
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>
        </GroupBox>
      </Show>
    </div>
  );
}
