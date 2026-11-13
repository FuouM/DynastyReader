/**
 * DynastyReader-only buttons built on SoulWindow's Button: add-to-collection, open-externally,
 * the Library "Back + Refresh" pair and the blacklist display-mode switch.
 */
import type { Accessor } from "solid-js";
import { Button, Icon, SegmentedSwitch, type ButtonProps } from "soulwindow/solid";
import { t } from "../i18n";
import { openExternal } from "../api/navigation";
import type { BlacklistMode } from "../types/blacklist";
import { ArrowLeftIcon, ExternalLinkIcon, FolderIcon, RefreshIcon } from "./icons";

export interface AddToCollectionButtonProps extends Omit<ButtonProps, "onClick" | "icon"> {
  onOpen: (anchorEl: HTMLElement) => void;
}

export function AddToCollectionButton(props: AddToCollectionButtonProps) {
  return (
    <Button
      class={props.class}
      style={props.style}
      title={props.title ?? t("browse.feed.addToFavoritesOrCustom")}
      icon={<FolderIcon />}
      text={props.text}
      textClass={props.textClass}
      classList={props.classList}
      disabled={props.disabled}
      onClick={(ev) => {
        ev.stopPropagation();
        props.onOpen(ev.currentTarget as HTMLElement);
      }}
    />
  );
}

export interface ExternalLinkButtonProps extends Omit<ButtonProps, "onClick" | "icon"> {
  url: string;
}

export function ExternalLinkButton(props: ExternalLinkButtonProps) {
  return (
    <Button
      id={props.id}
      class={props.class}
      style={props.style}
      title={props.title}
      icon={<ExternalLinkIcon />}
      text={props.text}
      textClass={props.textClass}
      classList={props.classList}
      disabled={props.disabled}
      onClick={(ev) => {
        ev.stopPropagation();
        void openExternal(props.url);
      }}
    />
  );
}

export interface BackRefreshActionsProps {
  backLabel: string;
  onBack: () => void;
  onRefresh: () => void;
}

/** The standard "Back + Refresh" top-bar pair used by the Library sub-views. */
export function BackRefreshActions(props: BackRefreshActionsProps) {
  return (
    <>
      <Button
        icon={<ArrowLeftIcon />}
        text={props.backLabel}
        title={t("actionBar.back")}
        onClick={props.onBack}
      />
      <Button
        icon={<RefreshIcon />}
        text={t("actionBar.refresh")}
        title={t("actionBar.refresh")}
        onClick={props.onRefresh}
      />
    </>
  );
}

export interface BlacklistModeSwitchProps {
  id: string;
  value: Accessor<BlacklistMode>;
  onChange: (mode: BlacklistMode) => void;
}

export function BlacklistModeSwitch(props: BlacklistModeSwitchProps) {
  return (
    <div class="ds-bl-mode-bar">
      <span class="ds-bl-mode-label">
        {t("blacklist.modeHeader")}:
      </span>
      <SegmentedSwitch
        id={props.id}
        value={props.value()}
        onChange={(val) => props.onChange(val)}
        options={[
          { id: `${props.id}-hide`, value: "hide", icon: <Icon name="eye-slash" />, text: t("blacklist.modeHide"), title: t("blacklist.modeHideTooltip") },
          { id: `${props.id}-ghost`, value: "ghost", icon: <Icon name="eye-slash-fill" />, text: t("blacklist.modeGhost"), title: t("blacklist.modeGhostTooltip") },
          { id: `${props.id}-warn`, value: "warn", icon: <Icon name="exclamation-triangle" />, text: t("blacklist.modeWarn"), title: t("blacklist.modeWarnTooltip") },
        ]}
      />
    </div>
  );
}
