/**
 * Unified item row component used across Library views:
 *  - Followed Series
 *  - Collections list
 *  - Bookmarks (Read Later)
 *  - Reading History
 *  - Collection Detail items
 */

import { createSignal, onCleanup, Show } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import { isMobile } from "../stores/platform";
import { triggerHaptic } from "../utils/haptics";
import { decodeEntities } from "../utils/formatting";
import { t } from "../i18n";
import { ListItem } from "../components/ListItem";
import { Cover } from "../components/Cover";
import { OfflineBadge } from "../components/Badges";
import { ConfirmDeleteButton, Button, IconText, ExternalLinkButton } from "../components/Button";
import { BlacklistIcon, TrashIcon } from "../components/Icon";
export interface LibraryItemRowProps {
  title: string;
  subtitle?: string;
  badge?: string;
  blacklisted?: boolean;
  cover?: string | null;
  coverAlt?: string;
  icon?: string;
  iconColor?: string;
  isFullyCached?: boolean;
  onOpen: () => void;
  actionLabel?: string;
  actionIcon?: string;
  externalUrl?: string;
  editTitle?: string;
  onEdit?: () => void;
  exportTitle?: string;
  onExport?: () => void;
  playTitle?: string;
  onPlay?: () => void;
  deleteTitle?: string;
  onDelete?: () => Promise<void> | void;
  onLongPress?: () => void;
  /** QoL-L3: bulk-select mode — row click toggles selection, actions hidden. */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onCoverError?: () => void;
  onCoverRetry?: () => void;
}
export function LibraryItemRow(props: LibraryItemRowProps) {
  let containerRef: HTMLDivElement | undefined;
  let rowContentEl: HTMLDivElement | undefined;
  let touchStartX = 0;
  let touchStartY = 0;
  let longPressTimer: number | null = null;
  let didLongPress = false;
  let isSwiping = false;
  let currentOffset = 0;
  let hasSnapped = false;
  const [isOpen, setIsOpen] = createSignal(false);
  const [isDeleting, setIsDeleting] = createSignal(false);

  const clearLongPress = () => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  onCleanup(() => {
    clearLongPress();
  });

  makeEventListener(window, "touchstart", (ev: TouchEvent) => {
    if (isOpen() && containerRef && !containerRef.contains(ev.target as Node)) {
      closeSwipe();
    }
  });

  const handleTouchStart = (ev: TouchEvent) => {
    const t = ev.touches[0];
    if (!t) return;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    didLongPress = false;
    isSwiping = false;
    hasSnapped = false;

    clearLongPress();

    if (props.onLongPress || (props.selectionMode && props.onToggleSelect)) {
      longPressTimer = window.setTimeout(() => {
        didLongPress = true;
        triggerHaptic("snap");
        if (props.onLongPress) {
          props.onLongPress();
        } else if (props.onToggleSelect) {
          props.onToggleSelect();
        }
      }, 450);
    }
  };

  const handleTouchMove = (ev: TouchEvent) => {
    const t = ev.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX > 8 || absY > 8) {
      clearLongPress();
    }

    const canSwipeDelete = isMobile() && !!props.onDelete && !props.selectionMode && !isDeleting();
    if (!canSwipeDelete) return;

    if (!isSwiping) {
      if (isOpen()) {
        if (dx > 8 && absX > 1.2 * absY) {
          isSwiping = true;
          if (rowContentEl) {
            rowContentEl.style.willChange = "transform";
            rowContentEl.style.transition = "none";
          }
        }
      } else {
        if (dx < -8 && absX > 1.2 * absY) {
          isSwiping = true;
          if (rowContentEl) {
            rowContentEl.style.willChange = "transform";
            rowContentEl.style.transition = "none";
          }
        }
      }
    }

    if (isSwiping && rowContentEl) {
      if (ev.cancelable) ev.preventDefault();
      const base = isOpen() ? -72 : 0;
      const totalDx = base + dx;

      let clamped = 0;
      if (totalDx < 0) {
        if (totalDx >= -80) {
          clamped = totalDx;
        } else {
          const excess = Math.abs(totalDx) - 80;
          clamped = -80 - Math.pow(excess, 0.75);
        }
        clamped = Math.max(-180, clamped);
      } else {
        clamped = Math.min(24, totalDx * 0.2);
      }

      currentOffset = clamped;
      rowContentEl.style.transform = `translate3d(${clamped}px, 0, 0)`;

      if (clamped <= -72 && !hasSnapped) {
        triggerHaptic("snap");
        hasSnapped = true;
      } else if (clamped > -60) {
        hasSnapped = false;
      }
    }
  };

  const handleTouchEnd = () => {
    clearLongPress();
    if (!isSwiping || !rowContentEl) return;
    isSwiping = false;

    if (currentOffset <= -140 && props.onDelete) {
      setIsDeleting(true);
      triggerHaptic("confirm");
      rowContentEl.style.transition = "transform 0.18s cubic-bezier(0.4, 0, 1, 1)";
      rowContentEl.style.transform = "translate3d(-100%, 0, 0)";
      window.setTimeout(async () => {
        try {
          await props.onDelete?.();
        } finally {
          setIsDeleting(false);
          setIsOpen(false);
          if (rowContentEl) {
            rowContentEl.style.willChange = "auto";
            rowContentEl.style.transition = "";
            rowContentEl.style.transform = "";
          }
        }
      }, 180);
      return;
    }

    if (currentOffset <= -50) {
      setIsOpen(true);
      rowContentEl.style.transition = "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)";
      rowContentEl.style.transform = "translate3d(-72px, 0, 0)";
      window.setTimeout(() => {
        if (rowContentEl) rowContentEl.style.willChange = "auto";
      }, 200);
    } else {
      setIsOpen(false);
      rowContentEl.style.transition = "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)";
      rowContentEl.style.transform = "translate3d(0, 0, 0)";
      window.setTimeout(() => {
        if (rowContentEl) {
          rowContentEl.style.willChange = "auto";
          rowContentEl.style.transition = "";
          rowContentEl.style.transform = "";
        }
      }, 200);
    }
    currentOffset = 0;
  };

  const closeSwipe = () => {
    if (!isOpen() || !rowContentEl) return;
    setIsOpen(false);
    rowContentEl.style.transition = "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)";
    rowContentEl.style.transform = "translate3d(0, 0, 0)";
    window.setTimeout(() => {
      if (rowContentEl) {
        rowContentEl.style.willChange = "auto";
        rowContentEl.style.transition = "";
        rowContentEl.style.transform = "";
      }
    }, 200);
  };

  const handleDeleteClick = async (ev: MouseEvent) => {
    ev.stopPropagation();
    if (!props.onDelete || isDeleting()) return;
    setIsDeleting(true);
    triggerHaptic("confirm");
    if (rowContentEl) {
      rowContentEl.style.transition = "transform 0.18s cubic-bezier(0.4, 0, 1, 1)";
      rowContentEl.style.transform = "translate3d(-100%, 0, 0)";
    }
    window.setTimeout(async () => {
      try {
        await props.onDelete?.();
      } finally {
        setIsDeleting(false);
        setIsOpen(false);
        if (rowContentEl) {
          rowContentEl.style.willChange = "auto";
          rowContentEl.style.transition = "";
          rowContentEl.style.transform = "";
        }
      }
    }, 180);
  };

  const itemContent = (
    <div
      ref={rowContentEl}
      class="ds-swipe-content"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <ListItem
        class="ds-flex-row ds-clickable ds-library-item"
        cssText={props.selectionMode && props.selected ? "background:var(--sys-hover-bg);" : undefined}
        onClick={() => {
          if (didLongPress) {
            didLongPress = false;
            return;
          }
          if (isOpen()) {
            closeSwipe();
            return;
          }
          if (props.selectionMode) {
            props.onToggleSelect?.();
          } else {
            props.onOpen();
          }
        }}
      leading={
        <>
          <Show when={props.selectionMode}>
            <input
              type="checkbox"
              checked={!!props.selected}
              aria-label={t("library.selectRowLabel", { title: props.title })}
              style="width:16px;height:16px;flex-shrink:0;align-self:center;accent-color:var(--sys-primary, #0078d4);cursor:pointer;"
              onClick={(ev) => ev.stopPropagation()}
              onChange={() => props.onToggleSelect?.()}
            />
          </Show>
          <Show when={props.cover !== undefined}>
            <div class="ds-cover-wrap--shrink">
              <Cover
                path={props.cover ?? null}
                alt={props.coverAlt || props.title}
                imgClass="ds-collection-cover"
                placeholderClass="ds-collection-cover-placeholder"
                onError={props.onCoverError}
                onRetry={props.onCoverRetry}
              />
            </div>
          </Show>

          <Show when={props.icon}>
            <i class={`bi ${props.icon} ds-icon-14`} style={{ color: props.iconColor || "var(--sys-link, #0078d4)" }}></i>
          </Show>
        </>
      }
      title={
        <div class="ds-flex-row ds-flex-wrap-6">
          <span class="ds-item-title ds-item-title--row">
            <span>{decodeEntities(props.title)}</span>
            <OfflineBadge when={props.isFullyCached} />
          </span>
          <Show when={props.badge}>
            <span class="ds-muted ds-kind-badge">
              {props.badge}
            </span>
          </Show>
          <Show when={props.blacklisted}>
            <span class="ds-muted ds-warn-badge">
              <IconText icon={<BlacklistIcon filled={true} />}>{t("series.blacklistedBadge")}</IconText>
            </span>
          </Show>
        </div>
      }
      body={
        <Show when={props.subtitle}>
          <div class="ds-item-meta">{props.subtitle}</div>
        </Show>
      }
      actions={
        <Show when={!props.selectionMode}>
          <>
          <Show when={props.actionLabel}>
            <Button
              icon={
                <Show when={props.actionIcon}>
                  <i class={`bi ${props.actionIcon}`} />
                </Show>
              }
              text={props.actionLabel}
              textClass="ds-action-btn-text"
              className="ds-btn-compact"
              onClick={(ev) => {
                ev.stopPropagation();
                props.onOpen();
              }}
            />
          </Show>

          <Show when={props.externalUrl}>
            <ExternalLinkButton
              title={t("library.openOnDynastyTooltip")}
              url={props.externalUrl!}
            />
          </Show>
          <Show when={props.onEdit}>
            <Button
              icon={<i class="bi bi-pencil" />}
              className="ds-btn-icon"
              title={props.editTitle || t("local.editTooltip")}
              onClick={(ev) => {
                ev.stopPropagation();
                props.onEdit!();
              }}
            />
          </Show>
          <Show when={props.onPlay}>
            <Button
              icon={<i class="bi bi-play-fill" />}
              className="ds-btn-icon"
              title={props.playTitle || t("library.continueReading")}
              onClick={(ev) => {
                ev.stopPropagation();
                props.onPlay!();
              }}
            />
          </Show>
          <Show when={props.onExport}>
            <Button
              icon={<i class="bi bi-box-arrow-up" />}
              className="ds-btn-icon"
              title={props.exportTitle || t("library.exportTooltip")}
              onClick={(ev) => {
                ev.stopPropagation();
                props.onExport!();
              }}
            />
          </Show>
          <Show when={props.onDelete}>
            <ConfirmDeleteButton
              icon={<TrashIcon />}
              className="ds-btn-icon"
              title={props.deleteTitle || t("library.deleteItemTooltip")}
              onConfirm={async () => {
                await props.onDelete!();
              }}
            />
          </Show>
        </>
        </Show>
      }
      />
    </div>
  );

  return (
    <Show
      when={isMobile() && !!props.onDelete && !props.selectionMode}
      fallback={itemContent}
    >
      <div ref={containerRef} class="ds-swipe-row-container">
        <div class="ds-swipe-action-reveal">
          <button
            type="button"
            class="ds-swipe-delete-btn"
            title={props.deleteTitle || t("library.deleteItemTooltip")}
            onClick={handleDeleteClick}
          >
            <TrashIcon />
            <span>{t("common.delete")}</span>
          </button>
        </div>
        {itemContent}
      </div>
    </Show>
  );
}