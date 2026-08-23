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
  /** Optional trailing CSS appended to the bar style (default margin is 6px). */
  cssText?: string;
}

export function BlacklistNotice(props: BlacklistNoticeProps) {
  return (
    <div
      class="ds-row ds-blacklist-notice"
      style={`background:var(--ds-warn-bg);border:1px solid var(--ds-warn-border);color:var(--ds-warn-text);border-radius:3px;padding:4px 10px;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:11px;${props.cssText ?? ""}`}
    >
      <div class="ds-flex-row">
        <BlacklistIcon filled={true} color="#dc3545" />
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