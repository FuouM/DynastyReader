/**
 * Reusable status indicators, inline badges, and notice banners.
 * Consolidates OfflineBadge, WarningChip, and BlacklistNotice.
 */

import { Show } from "solid-js";
import { t } from "../i18n";
import { decodeEntities } from "../utils/formatting";
import type { BlacklistMode } from "../types/blacklist";
import { Icon, WarningIcon, BlacklistIcon } from "./Icon";
import { IconButton } from "./Button";

// ── 1. Offline Badge ─────────────────────────────────────────────────────────

export interface OfflineBadgeProps {
  /** Renders nothing when false. */
  when?: boolean;
}

/**
 * "Available Offline (Fully Cached)" badge shown next to titles of fully
 * cached chapters.
 */
export function OfflineBadge(props: OfflineBadgeProps) {
  return (
    <Show when={props.when ?? true}>
      <Icon
        name="cloud-check-fill"
        class="ds-offline-icon"
        title={t("dialogs.offlineBadge.tooltip")}
      />
    </Show>
  );
}

// ── 2. Warning Chip ──────────────────────────────────────────────────────────

export interface WarningChipProps {
  mode: BlacklistMode;
  tags: string[];
}

/**
 * Inline blacklist badge ("Content Warning" / "Blacklisted") shown next to
 * titles of blacklisted chapters.
 */
export function WarningChip(props: WarningChipProps) {
  return (
    <span class="ds-warning-chip">
      <WarningIcon />{" "}
      {props.mode === "warn" ? t("dialogs.triggerWarning.chipWarning") : t("dialogs.triggerWarning.chipBlacklisted")}:{" "}
      {decodeEntities(props.tags.join(", "))}
    </span>
  );
}

// ── 3. Blacklist Notice Banner ───────────────────────────────────────────────

export interface BlacklistNoticeProps {
  count: number;
  /** Singular noun describing the hidden items, e.g. "chapter" or "result". */
  noun: string;
  showHidden: boolean;
  onToggle: () => void;
}

/**
 * Blacklist hide-notice bar with a Show/Hide toggle.
 */
export function BlacklistNotice(props: BlacklistNoticeProps) {
  const message = (): string =>
    props.noun === "chapter"
      ? t("dialogs.blacklistNotice.hiddenChapter", { count: props.count })
      : t("dialogs.blacklistNotice.hiddenResult", { count: props.count });
  return (
    <div class="ds-row ds-blacklist-notice">
      <div class="ds-flex-row">
        <BlacklistIcon filled={true} color="var(--ds-danger-text)" />
        <span>{message()}</span>
      </div>
      <IconButton
        className="ds-btn-sm"
        icon={<Icon name={props.showHidden ? "eye-slash" : "eye"} />}
        text={props.showHidden
          ? t("dialogs.blacklistNotice.hideButton")
          : t("dialogs.blacklistNotice.showButton", { count: props.count })}
        onClick={props.onToggle}
      />
    </div>
  );
}
