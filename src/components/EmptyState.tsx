/**
 * Centered empty-state block (`.ds-empty-state`). Promoted out of
 * ActionBar.tsx so every view can render a consistent empty state with an
 * optional icon and per-site styling overrides.
 */

import { Show, type JSX } from "solid-js";

export interface EmptyStateProps {
  iconClass?: string;
  iconCssText?: string;
  cssText?: string;
  children?: JSX.Element;
}

export function EmptyState(props: EmptyStateProps) {
  return (
    <div class="ds-empty-state" style={props.cssText}>
      <Show when={props.iconClass}>
        <i class={props.iconClass} style={props.iconCssText} aria-hidden="true"></i>
      </Show>
      {props.children}
    </div>
  );
}