import { For } from "solid-js";
import { Icon } from "../Icon";
import { getSettingsSections, type SettingsSectionId } from "./types";

export interface SettingsSidebarProps {
  activeSection: string;
  onSelect: (id: SettingsSectionId) => void;
}

export function SettingsSidebar(props: SettingsSidebarProps) {
  return (
    <div class="ds-settings-sidebar">
      <For each={getSettingsSections()}>
        {(sec) => (
          <button
            type="button"
            class="ds-settings-nav-item"
            classList={{ active: props.activeSection === sec.id }}
            title={`Jump to ${sec.label}`}
            onClick={() => props.onSelect(sec.id)}
          >
            <Icon name={sec.icon} />
            <span>{sec.label}</span>
          </button>
        )}
      </For>
    </div>
  );
}
