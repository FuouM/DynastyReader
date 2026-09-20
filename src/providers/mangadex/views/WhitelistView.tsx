/**
 * MangaDex Feed Allowlist (Whitelist) View
 * Inverse of Series Blacklist:
 * - Toggle allowlist filtering on/off
 * - Manage allowed tags / genres (defaults to Girls' Love)
 * - Quick-add popular genres & search all MangaDex official tags
 */

import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js";
import { navigate } from "../../../stores/router";
import { setActions, showBanner } from "../../../stores/topbar";
import {
  whitelistEnabled,
  setWhitelistEnabled,
  whitelistedTags,
  addWhitelistedTag,
  removeWhitelistedTag,
  type WhitelistTag,
} from "../db/whitelist.repo";
import { getTags } from "../api/manga";
import { GIRLS_LOVE_TAG_ID } from "../api/constants";
import { GroupBox } from "../../../components/GroupBox";
import { Button, BackRefreshActions, IconText } from "../../../components/Button";
import { ListItem } from "../../../components/ListItem";
import { TagPill } from "../../../components/TagRow";
import { ListCheckIcon, TrashIcon, SearchIcon, CheckIcon } from "../../../components/Icon";
import { Loading } from "../../../components/Feedback";
import type { MangaDexTag } from "../types";

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

export function WhitelistView() {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [allTagsResource] = createResource<MangaDexTag[]>(getTags);

  createEffect(() => {
    setActions(
      <BackRefreshActions
        backLabel="Back to Browse"
        onBack={() => navigate({ view: "browse" })}
        onRefresh={() => {
          showBanner("Allowlist refreshed");
        }}
      />,
    );
  });

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

  return (
    <div id="ds-whitelist-view-container" class="ds-bl-view">
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
    </div>
  );
}
