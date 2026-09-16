import { Show } from "solid-js";
import { Button } from "../components/Button";
import { AddToCollectionButton } from "../components/AddToCollectionButton";
import { ExternalLinkButton } from "../components/ExternalLinkButton";
import {
  BlacklistIcon,
  BookmarkIcon,
  CloudDownloadIcon,
  RefreshIcon,
} from "../components/Icon";
import { t } from "../i18n";

export interface SeriesActionsProps {
  followed: () => boolean;
  busyFollow: () => boolean;
  onToggleFollow: () => void;
  blacklisted: () => boolean;
  busyBlacklist: () => boolean;
  onToggleBlacklist: () => void;
  onRefresh: () => void;
  onOpenAddToCol: (anchorEl: HTMLElement) => void;
  openUrl: string;
  seriesType?: string;
  onDownloadAll?: () => void;
}

export function SeriesActions(props: SeriesActionsProps) {
  return (
    <>
      <Button
        icon={props.followed() ? <BookmarkIcon filled={true} /> : <BookmarkIcon />}
        text={props.followed() ? t("series.following") : t("series.follow")}
        disabled={props.busyFollow()}
        onClick={props.onToggleFollow}
      />
      <AddToCollectionButton
        text={t("series.addToButton")}
        onOpen={props.onOpenAddToCol}
      />
      <Button
        icon={props.blacklisted() ? <BlacklistIcon filled={true} color="var(--ds-warn-text,#d97706)" /> : <BlacklistIcon />}
        text={props.blacklisted() ? t("series.blacklistedBadge") : t("series.blacklistButton")}
        classList={{ active: props.blacklisted() }}
        title={props.blacklisted() ? t("series.unblacklistTooltip") : t("series.blacklistTooltip")}
        disabled={props.busyBlacklist()}
        onClick={props.onToggleBlacklist}
      />
      <Button
        icon={<RefreshIcon />}
        text={t("common.refresh")}
        title={t("series.reloadTooltip")}
        onClick={props.onRefresh}
      />
      <Show when={props.onDownloadAll}>
        <Button
          icon={<CloudDownloadIcon />}
          text={t("series.downloadAll")}
          title={t("series.downloadAllTooltip")}
          onClick={props.onDownloadAll}
        />
      </Show>
      <Show when={props.openUrl}>
        <ExternalLinkButton
          className="ds-btn-icon"
          title={t("series.openInBrowserTooltip", {
            type: props.seriesType ? props.seriesType.toLowerCase() : "series",
          })}
          url={props.openUrl}
        />
      </Show>
    </>
  );
}
