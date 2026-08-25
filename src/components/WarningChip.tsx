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
    <span class="ds-warning-chip">
      <WarningIcon />{" "}
      {props.mode === "warn" ? t("dialogs.triggerWarning.chipWarning") : t("dialogs.triggerWarning.chipBlacklisted")}:{" "}
      {decodeEntities(props.tags.join(", "))}
    </span>
  );
}