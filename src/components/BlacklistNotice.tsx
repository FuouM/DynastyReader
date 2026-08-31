/**
 * Blacklist hide-notice bar with a Show/Hide toggle. Consolidated from two
 * inline copies (BrowseFeed, BrowseSearch).
 */
import { IconButton } from "./Button";
import { t } from "../i18n";
import { BlacklistIcon, Icon } from "./Icon";

export interface BlacklistNoticeProps {
  count: number;
  /** Singular noun describing the hidden items, e.g. "chapter" or "result". */
  noun: string;
  showHidden: boolean;
  onToggle: () => void;
}

export function BlacklistNotice(props: BlacklistNoticeProps) {
  return (
    <div class="ds-row ds-blacklist-notice">
      <div class="ds-flex-row">
        <BlacklistIcon filled={true} color="var(--ds-danger-text)" />
        <span>
          <b>{props.count}</b> {props.noun}
          {props.count === 1 ? "" : "s"} {t("browse.search.hiddenByBlacklist", { count: props.count }).replace(/^[0-9]+\s+/, "").replace(/results\s+/, "")}
        </span>
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