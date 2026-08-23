/**
 * Inline blacklist badge ("Content Warning" / "Blacklisted") shown next to
 * titles of blacklisted chapters. Consolidated from two inline copies
 * (FeedItemRow, BrowseSearch SearchResultRow).
 */

import { decodeEntities } from "../stores";
import { t } from "../i18n";
import type { BlacklistMode } from "../db";
import { WarningIcon } from "./Icon";

export interface WarningChipProps {
  mode: BlacklistMode;
  tags: string[];
}

export function WarningChip(props: WarningChipProps) {
  return (
    <span
      style="font-size:9px;background:var(--ds-danger-bg);color:var(--ds-danger-text);padding:1px 5px;border-radius:2px;border:1px solid var(--ds-danger-border);display:inline-flex;align-items:center;gap:3px;font-weight:600;"
    >
      <WarningIcon />{" "}
      {props.mode === "warn" ? t("dialogs.triggerWarning.chipWarning") : t("dialogs.triggerWarning.chipBlacklisted")}:{" "}
      {decodeEntities(props.tags.join(", "))}
    </span>
  );
}