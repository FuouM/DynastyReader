import { For, Show, type JSX } from "solid-js";
import { Button } from "./Button";

export interface SubTab {
  id: string;
  label: string;
  shortLabel?: string;
  icon?: string;
  count?: number;
}

export interface SubTabsProps {
  tabs: readonly SubTab[];
  activeTab: string;
  onSwitch: (id: string) => void;
  /** Whether to use short labels (e.g. on compact breakpoints). */
  compact?: boolean;
  /** Content rendered on the right side of the tab bar. */
  right?: JSX.Element;
}

/**
 * Horizontal sub-tab bar with segmented buttons and optional right-side actions.
 * Used by BrowseView and LibraryView for their tab navigation rows.
 */
export function SubTabs(props: SubTabsProps) {
  return (
    <div class="ds-subtabs">
      <div class="ds-subtabs-left">
        <For each={props.tabs}>
          {(tab) => (
            <Button
              className={`ds-subtab${props.activeTab === tab.id ? " active" : ""}`}
              title={typeof tab.count === "number" ? `${tab.label} (${tab.count})` : tab.label}
              onClick={() => props.onSwitch(tab.id)}
            >
              {tab.icon ? <i class={`bi ${tab.icon} ds-mr-4`} /> : undefined}
              <span class="ds-subtab-label">{props.compact ? (tab.shortLabel ?? tab.label) : tab.label}</span>
              <Show when={typeof tab.count === "number"}>
                <span class="ds-subtab-count">{tab.count}</span>
              </Show>
            </Button>
          )}
        </For>
      </div>
      <Show when={props.right}>
        <div class="ds-subtabs-right">{props.right}</div>
      </Show>
    </div>
  );
}
