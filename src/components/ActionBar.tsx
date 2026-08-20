/**
 * Small action-bar / empty-state components shared across views. Port of `action-bar.ts`.
 */

import { Show, type JSX } from "solid-js";

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
        <i class="bi bi-arrow-left"></i> {props.backLabel}
      </TopbarAction>
      <TopbarAction title="Refresh" onClick={props.onRefresh}>
        <i class="bi bi-arrow-clockwise"></i> Refresh
      </TopbarAction>
    </>
  );
}

export interface EmptyStateProps {
  iconClass?: string;
  children?: JSX.Element;
}

/** Centered empty-state block. */
export function EmptyState(props: EmptyStateProps) {
  return (
    <div class="ds-empty-state">
      <Show when={props.iconClass}>
        <i class={props.iconClass} aria-hidden="true"></i>
      </Show>
      {props.children}
    </div>
  );
}