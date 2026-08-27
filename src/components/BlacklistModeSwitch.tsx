import { type Accessor } from "solid-js";
import { t } from "../i18n";
import { type BlacklistMode } from "../db";
import { Icon } from "./Icon";
import { SegmentedSwitch } from "./Button";

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
        onChange={(val) => props.onChange(val as BlacklistMode)}
        options={[
          { id: `${props.id}-hide`, value: "hide", icon: <Icon name="eye-slash" />, text: t("blacklist.modeHide") },
          { id: `${props.id}-ghost`, value: "ghost", icon: <Icon name="eye-slash-fill" />, text: t("blacklist.modeGhost") },
          { id: `${props.id}-warn`, value: "warn", icon: <Icon name="exclamation-triangle" />, text: t("blacklist.modeWarn") },
        ]}
      />
    </div>
  );
}
