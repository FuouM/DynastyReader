import type { JSX } from "solid-js";
import { DsSwitch } from "./Button";

export interface SettingsRowProps {
  /** Label text (typically `t("settings.reader.someKey")`). */
  label: JSX.Element;
  /** Optional description text below the label. */
  desc?: JSX.Element;
  /** Whether to show the top border divider (omit for the first row). */
  divider?: boolean;
  /** Whether to stack the control on a new row below label & description. */
  stacked?: boolean;
  /** The control element(s) rendered on the right side. */
  children: JSX.Element;
}
/**
 * Reusable two-column settings row: label + description on the left,
 * control on the right. Matches the WinForms aesthetic used in
 * ReaderSettings, HotkeySettings, etc.
 */
export function SettingsRow(props: SettingsRowProps) {
  return (
    <div
      class={`ds-settings-row${props.divider ? " has-divider" : ""}${props.stacked ? " is-stacked" : ""}`}
    >
      <div class="ds-settings-row-label">
        <div class="ds-label">
          {props.label}
        </div>
        {props.desc && (
          <div class="ds-muted ds-settings-row-desc">
            {props.desc}
          </div>
        )}
      </div>
      <div class="ds-settings-row-control">
        {props.children}
      </div>
    </div>
  );
}

export interface SettingsToggleRowProps {
  id: string;
  label: JSX.Element;
  desc?: JSX.Element;
  checked: boolean;
  title?: string;
  disabled?: boolean;
  divider?: boolean;
  onChange: (next: boolean) => void;
}

/**
 * Two-column settings row with an integrated toggle switch.
 * Eliminates boilerplate across Reader, Display, Advanced, and Storage settings.
 */
export function SettingsToggleRow(props: SettingsToggleRowProps) {
  return (
    <SettingsRow divider={props.divider} label={props.label} desc={props.desc}>
      <DsSwitch
        id={props.id}
        checked={props.checked}
        title={props.title}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    </SettingsRow>
  );
}
