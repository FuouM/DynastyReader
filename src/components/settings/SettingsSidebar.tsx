import { For } from "solid-js";
import { t } from "../../i18n";
import { Icon } from "../Icon";
import { IconButton } from "../Button";
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
          <IconButton
            className="ds-settings-nav-item"
            classList={{ active: props.activeSection === sec.id }}
            title={t("settings.jumpToSectionTooltip", { section: sec.label })}
            onClick={() => props.onSelect(sec.id)}
            icon={<Icon name={sec.icon} />}
            text={sec.label}
          />
        )}
      </For>
    </div>
  );
}
