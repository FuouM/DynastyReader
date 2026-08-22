/**
 * Small action-bar / empty-state components shared across views. Port of `action-bar.ts`.
 */

import type { JSX } from "solid-js";
import { ArrowLeftIcon, RefreshIcon } from "./Icon";

export interface TopbarActionProps {
  html?: JSX.Element;
  title: string;
  onClick: () => void;
  children?: JSX.Element;
}

/** Compact top-bar action button. */
export function TopbarAction(props: TopbarActionProps) {
  return (
    <button
      type="button"
      class="win-button ds-btn-compact"
      title={props.title}
      onClick={() => props.onClick()}
    >
      {props.children ?? props.html}
    </button>
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
      <TopbarAction
        title="Back"
        onClick={props.onBack}
      >
        <ArrowLeftIcon /> <span class="ds-btn-text">{props.backLabel}</span>
      </TopbarAction>
      <TopbarAction title="Refresh" onClick={props.onRefresh}>
        <RefreshIcon /> <span class="ds-btn-text">Refresh</span>
      </TopbarAction>
    </>
  );
}

