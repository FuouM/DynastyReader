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