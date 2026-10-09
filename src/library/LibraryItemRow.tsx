/**
 * Unified item row component used across Library views:
 *  - Followed Series
 *  - Collections list
 *  - Bookmarks (Read Later)
 *  - Reading History
 *  - Collection Detail items
 */

import { onCleanup, Show } from "solid-js";
import { triggerHaptic } from "../utils/haptics";
import { decodeEntities } from "../utils/formatting";
import { t } from "../i18n";
import { ListItem } from "../components/ListItem";
import { Cover } from "../components/Cover";
import { OfflineBadge } from "../components/Badges";
import { ConfirmDeleteButton, Button, IconText, ExternalLinkButton } from "../components/Button";
import { BlacklistIcon, TrashIcon, CheckIcon, Icon } from "../components/Icon";
import { useCopyLink } from "../hooks/useCopyLink";
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
  let startX = 0;
  let startY = 0;
  let longPressTimer: number | null = null;
  let didLongPress = false;
  const { copied, handleCopyLink } = useCopyLink({
    getUrl: () => props.externalUrl ?? "",
    namespace: "library-item-row",
  });
  const clearLongPress = () => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  onCleanup(() => {
    clearLongPress();
  });

  const handlePointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    startX = ev.clientX;
    startY = ev.clientY;
    didLongPress = false;
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

  const handlePointerMove = (ev: PointerEvent) => {
    if (longPressTimer === null) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (Math.hypot(dx, dy) > 10) {
      clearLongPress();
    }
  };

  const handlePointerUpOrCancel = () => {
    clearLongPress();
  };

  const handleClick = () => {
    if (didLongPress) {
      didLongPress = false;
      return;
    }
    if (props.selectionMode) {
      props.onToggleSelect?.();
    } else {
      props.onOpen();
    }
  };

  return (
    <div
      class="ds-library-item-wrap"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
    >
      <ListItem
        class="ds-flex-row ds-clickable ds-library-item"
        cssText={props.selectionMode && props.selected ? "background:var(--sys-hover-bg);" : undefined}
        onClick={handleClick}
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
                <Button
                  className="ds-btn-icon"
                  style={{ "aspect-ratio": "1 / 1" }}
                  icon={copied() ? <CheckIcon /> : <Icon name="link-45deg" />}
                  title={copied() ? t("common.copied") : t("reader.toolbar.copyLink")}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    void handleCopyLink(ev);
                  }}
                />
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
}