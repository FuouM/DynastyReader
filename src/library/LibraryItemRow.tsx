/**
 * Unified item row component used across Library views:
 *  - Followed Series
 *  - Collections list
 *  - Bookmarks (Read Later)
 *  - Reading History
 *  - Collection Detail items
 */

import { Show } from "solid-js";
import { decodeEntities } from "../utils/html";
import { t } from "../i18n";
import { ListItem } from "../components/ListItem";
import { Cover } from "../components/Cover";
import { OfflineBadge } from "../components/OfflineBadge";
import { ExternalLinkButton } from "../components/ExternalLinkButton";
import { ConfirmDeleteButton, IconButton, IconText } from "../components/Button";
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
  deleteTitle?: string;
  onDelete?: () => Promise<void> | void;
  /** QoL-L3: bulk-select mode — row click toggles selection, actions hidden. */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function LibraryItemRow(props: LibraryItemRowProps) {
  return (
    <ListItem
      class="ds-flex-row ds-clickable ds-library-item"
      cssText={props.selectionMode && props.selected ? "background:var(--sys-hover-bg);" : undefined}
      onClick={props.selectionMode ? () => props.onToggleSelect?.() : props.onOpen}
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
        props.selectionMode ? undefined : (
        <>
          <Show when={props.actionLabel}>
            <IconButton
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
            <IconButton
              icon={<i class="bi bi-pencil" />}
              className="ds-btn-icon"
              title={props.editTitle || t("local.editTooltip")}
              onClick={(ev) => {
                ev.stopPropagation();
                props.onEdit!();
              }}
            />
          </Show>
          <Show when={props.onExport}>
            <IconButton
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
        )
      }
    />
  );
}