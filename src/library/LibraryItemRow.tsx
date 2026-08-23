/**
 * Unified item row component used across Library views:
 *  - Followed Series
 *  - Collections list
 *  - Bookmarks (Read Later)
 *  - Reading History
 *  - Collection Detail items
 */

import { Show } from "solid-js";
import { decodeEntities } from "../stores";
import { t } from "../i18n";
import { ListItem } from "../components/ListItem";
import { Cover } from "../components/Cover";
import { OfflineBadge } from "../components/OfflineBadge";
import { ExternalLinkButton } from "../components/ExternalLinkButton";
import { ConfirmDeleteButton, IconButton } from "../components/Button";
import { TrashIcon } from "../components/Icon";

export interface LibraryItemRowProps {
  title: string;
  subtitle?: string;
  badge?: string;
  cover?: string | null;
  coverAlt?: string;
  icon?: string;
  iconColor?: string;
  isFullyCached?: boolean;
  onOpen: () => void;
  actionLabel?: string;
  actionIcon?: string;
  externalUrl?: string;
  deleteTitle?: string;
  onDelete?: () => Promise<void> | void;
}

export function LibraryItemRow(props: LibraryItemRowProps) {
  return (
    <ListItem
      class="ds-flex-row ds-clickable"
      cssText="padding:5px 8px;border-radius:2px;gap:8px;cursor:pointer;align-items:center;"
      onClick={props.onOpen}
      leading={
        <>
          <Show when={props.cover !== undefined}>
            <div style="flex-shrink:0;cursor:pointer;">
              <Cover
                path={props.cover ?? null}
                alt={props.coverAlt || props.title}
                imgClass="ds-collection-cover"
                placeholderClass="ds-collection-cover-placeholder"
              />
            </div>
          </Show>

          <Show when={props.icon}>
            <i
              class={`bi ${props.icon}`}
              style={{
                color: props.iconColor || "var(--sys-primary,#0078d4)",
                "font-size": "14px",
                "flex-shrink": 0,
              }}
            ></i>
          </Show>
        </>
      }
      title={
        <div class="ds-flex-row" style="align-items:center;gap:6px;flex-wrap:wrap;">
          <span
            class="ds-item-title"
            style="font-weight:600;font-size:12px;display:inline-flex;align-items:center;gap:4px;"
          >
            <span>{decodeEntities(props.title)}</span>
            <OfflineBadge when={props.isFullyCached} />
          </span>
          <Show when={props.badge}>
            <span
              class="ds-muted"
              style="font-size:10px;background:var(--sys-control-bg,#eaeaea);padding:1px 5px;border-radius:2px;text-transform:capitalize;"
            >
              {props.badge}
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
        <>
          <Show when={props.actionLabel}>
            <IconButton
              icon={
                <Show when={props.actionIcon}>
                  <i class={`bi ${props.actionIcon}`} />
                </Show>
              }
              text={props.actionLabel}
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
          <Show when={props.onDelete}>
            <ConfirmDeleteButton
              icon={<TrashIcon />}
              className="ds-btn-icon-sm"
              title={props.deleteTitle || t("library.deleteItemTooltip")}
              onConfirm={async () => {
                await props.onDelete!();
              }}
            />
          </Show>
        </>
      }
    />
  );
}