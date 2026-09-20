/**
 * MangaDex Series Detail View
 * Displays manga metadata, author credits, follow toggle, and multi-scanlator chapter accordion.
 */

import { createSignal, For, onMount, Show } from "solid-js";
import { getManga, getMangaFeed } from "../api/manga";
import { formatMangaTitle, getMangaAuthors, getMangaCoverUrl, groupChaptersByNumber, parseChapterNumber } from "../mapping";
import { followManga, isMangaFollowed, unfollowManga } from "../db/library.repo";
import { getMangaReadingProgress } from "../db/progress.repo";
import { navigate, route } from "../../../stores/router";
import { showBanner } from "../../../stores/topbar";
import { enqueueChapters } from "../../../ipc";
import { Loading } from "../../../components/Feedback";
import { GroupBox } from "../../../components/GroupBox";
import {
  CheckIcon,
  ExternalLinkIcon,
  StarIcon,
  DownloadIcon,
} from "../../../components/Icon";
import type {
  MangaDexChapterGroup,
  MangaDexChapterUpload,
  MangaDexManga,
  MangaDexReadingProgressRow,
} from "../types";

export function MangaDexSeries() {
  const [manga, setManga] = createSignal<MangaDexManga | null>(null);
  const [groups, setGroups] = createSignal<MangaDexChapterGroup[]>([]);
  const [progressMap, setProgressMap] = createSignal<Record<string, MangaDexReadingProgressRow>>({});
  const [isFollowed, setIsFollowed] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [expandedChapters, setExpandedChapters] = createSignal<Set<string>>(new Set());

  const permalink = () => route().seriesPermalink || "";
  const mangaId = () => permalink().replace(/^mdx:/, "");

  const toggleExpand = (chNum: string | null): void => {
    const key = chNum ?? "__oneshot__";
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const loadData = async (): Promise<void> => {
    const id = mangaId();
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const [mangaData, feedData, followed, progress] = await Promise.all([
        getManga(id),
        getMangaFeed(id, { limit: 500, order: { chapter: "asc" } }),
        isMangaFollowed(id),
        getMangaReadingProgress(id),
      ]);

      setManga(mangaData);
      setIsFollowed(followed);
      setProgressMap(progress);

      const grouped = groupChaptersByNumber(feedData.data, "asc");
      setGroups(grouped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load series details");
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void loadData();
  });

  const handleFollowToggle = async (): Promise<void> => {
    const m = manga();
    if (!m) return;
    const id = m.id;
    const title = formatMangaTitle(m);
    const coverUrl = getMangaCoverUrl(m, "256");

    if (isFollowed()) {
      await unfollowManga(id);
      setIsFollowed(false);
    } else {
      await followManga(id, title, coverUrl);
      setIsFollowed(true);
    }
  };

  const openChapter = (upload: MangaDexChapterUpload, m: MangaDexManga): void => {
    const title = formatMangaTitle(m);
    navigate({
      view: "reader",
      chapterPermalink: `mdx:${upload.id}`,
      chapterTitle: upload.title || (upload.chapterNumber ? `Ch. ${upload.chapterNumber}` : "Chapter"),
      seriesPermalink: `mdx:${m.id}`,
      seriesName: title,
    });
  };
  const handleDownload = async (upload: MangaDexChapterUpload, m: MangaDexManga, ev: MouseEvent): Promise<void> => {
    ev.stopPropagation();
    try {
      await enqueueChapters([
        {
          series_permalink: `mdx:${m.id}`,
          series_title: formatMangaTitle(m),
          chapter_permalink: `mdx:${upload.id}`,
          chapter_title: upload.title || (upload.chapterNumber ? `Ch. ${upload.chapterNumber}` : "Chapter"),
          chapter_index: Math.max(0, Math.floor(parseChapterNumber(upload.chapterNumber))),
        },
      ]);
      showBanner(`Download queued for ${upload.chapterNumber ? `Ch. ${upload.chapterNumber}` : "Chapter"}`);
    } catch (err) {
      showBanner(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div id="ds-pane-dynamic" class="ds-pane" style="padding: 16px; overflow-y: auto;">
      <Show when={loading()}>
        <div style="display: flex; justify-content: center; padding: 40px 0;">
          <Loading />
        </div>
      </Show>

      <Show when={error()}>
        <div class="ds-banner ds-banner--error" style="margin-bottom: 12px;">
          {error()}
        </div>
      </Show>

      <Show when={!loading() && manga()}>
        {(m) => {
          const title = () => formatMangaTitle(m());
          const coverUrl = () => getMangaCoverUrl(m(), "512");
          const authors = () => getMangaAuthors(m());
          const desc = () => {
            const descMap = m().attributes.description;
            return descMap?.en || Object.values(descMap || {})[0] || "No description available.";
          };

          return (
            <div style="display: flex; flex-direction: column; gap: 16px; max-width: 900px; margin: 0 auto;">
              {/* Header Box */}
              <div class="ds-card" style="display: flex; gap: 16px; padding: 16px;">
                <div style="width: 140px; aspect-ratio: 2/3; flex-shrink: 0; background: var(--ds-bg-sunken); border-radius: 4px; overflow: hidden;">
                  <Show when={coverUrl()} fallback={<div class="ds-cover-placeholder" />}>
                    <img
                      src={coverUrl()!}
                      alt={title()}
                      style="width: 100%; height: 100%; object-fit: cover;"
                    />
                  </Show>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0;">
                  <h1 style="font-size: 18px; font-weight: 700; margin: 0; line-height: 1.3;">
                    {title()}
                  </h1>
                  <Show when={authors().length > 0}>
                    <div class="ds-muted" style="font-size: 12px;">
                      By {authors().join(", ")}
                    </div>
                  </Show>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                    <span class="ds-chip" style="font-size: 11px; text-transform: capitalize;">
                      Status: {m().attributes.status}
                    </span>
                    <span class="ds-chip ds-muted" style="font-size: 11px; text-transform: capitalize;">
                      Rating: {m().attributes.contentRating}
                    </span>
                  </div>
                  <div class="ds-muted" style="font-size: 12px; line-height: 1.4; max-height: 80px; overflow-y: auto; white-space: pre-wrap;">
                    {desc()}
                  </div>
                  <div style="margin-top: auto; display: flex; gap: 8px;">
                    <button
                      type="button"
                      class="win-button"
                      classList={{ "win-button--active": isFollowed() }}
                      onClick={handleFollowToggle}
                      style="display: flex; align-items: center; gap: 6px;"
                    >
                      <StarIcon size={14} filled={isFollowed()} />
                      <span>{isFollowed() ? "Followed" : "Follow Series"}</span>
                    </button>
                    <a
                      href={`https://mangadex.org/title/${m().id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="win-button"
                      style="display: flex; align-items: center; gap: 6px; text-decoration: none;"
                    >
                      <ExternalLinkIcon size={14} />
                      <span>MangaDex</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Chapters Accordion */}
              <GroupBox title={`Chapters (${groups().length})`}>
                <Show when={groups().length === 0}>
                  <div class="ds-muted" style="padding: 16px; text-align: center; font-size: 12px;">
                    No translated chapters found for this title.
                  </div>
                </Show>

                <div style="display: flex; flex-direction: column;">
                  <For each={groups()}>
                    {(group) => {
                      const hasMultiple = () => group.uploads.length > 1;
                      const isExpanded = () =>
                        expandedChapters().has(group.chapterNumber ?? "__oneshot__");

                      // Check if any upload is completed/read
                      const isAnyRead = () =>
                        group.uploads.some((u) => progressMap()[u.id]?.completed === 1);

                      const handleGroupClick = () => {
                        if (hasMultiple()) {
                          toggleExpand(group.chapterNumber);
                        } else if (group.uploads.length === 1) {
                          openChapter(group.uploads[0], m());
                        }
                      };

                      return (
                        <div style="border-bottom: 1px solid var(--ds-border-subtle, rgba(128,128,128,0.15));">
                          {/* Main Chapter Row */}
                          <div
                            class="ds-chapter-row"
                            classList={{ "ds-chapter-read": isAnyRead() }}
                            style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; cursor: pointer;"
                            onClick={handleGroupClick}
                          >
                            <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                              <Show when={isAnyRead()}>
                                <CheckIcon size={13} style="color: var(--ds-accent); flex-shrink: 0;" />
                              </Show>
                              <span class="ds-truncate" style="font-size: 12px; font-weight: 500;">
                                {group.displayTitle}
                              </span>
                            </div>

                            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                              <Show when={!hasMultiple() && group.uploads[0]}>
                                <span class="ds-muted" style="font-size: 11px;">
                                  {group.uploads[0].scanlatorName}
                                </span>
                                <button
                                  type="button"
                                  class="win-button ds-btn-icon"
                                  title="Download chapter"
                                  onClick={(e) => handleDownload(group.uploads[0], m(), e)}
                                  style="padding: 2px;"
                                >
                                  <DownloadIcon size={12} />
                                </button>
                              </Show>
                              <Show when={hasMultiple()}>
                                <span
                                  class="ds-chip"
                                  style="font-size: 10px; padding: 1px 6px;"
                                >
                                  {group.uploads.length} scanlations ▾
                                </span>
                              </Show>
                            </div>
                          </div>

                          {/* Expanded Scanlators Sub-rows */}
                          <Show when={hasMultiple() && isExpanded()}>
                            <div style="background: var(--ds-bg-sunken, rgba(0,0,0,0.04)); padding-left: 24px;">
                              <For each={group.uploads}>
                                {(upload) => {
                                  const isUploadRead = () =>
                                    progressMap()[upload.id]?.completed === 1;

                                  return (
                                    <div
                                      class="ds-chapter-row"
                                      classList={{ "ds-chapter-read": isUploadRead() }}
                                      style="display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; cursor: pointer;"
                                      onClick={() => openChapter(upload, m())}
                                    >
                                      <div style="display: flex; align-items: center; gap: 6px;">
                                        <Show when={isUploadRead()}>
                                          <CheckIcon size={11} style="color: var(--ds-accent);" />
                                        </Show>
                                        <span style="font-size: 11px; font-weight: 500;">
                                          {upload.scanlatorName}
                                        </span>
                                      </div>
                                      <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="ds-muted" style="font-size: 10px;">
                                          {upload.readableAt ? upload.readableAt.substring(0, 10) : ""}
                                        </span>
                                        <button
                                          type="button"
                                          class="win-button ds-btn-icon"
                                          title="Download scanlation"
                                          onClick={(e) => handleDownload(upload, m(), e)}
                                          style="padding: 2px;"
                                        >
                                          <DownloadIcon size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                }}
                              </For>
                            </div>
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </GroupBox>
            </div>
          );
        }}
      </Show>
    </div>
  );
}
