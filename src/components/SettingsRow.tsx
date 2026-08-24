import type { JSX } from "solid-js";

export interface SettingsRowProps {
  /** Label text (typically `t("settings.reader.someKey")`). */
  label: JSX.Element;
  /** Optional description text below the label. */
  desc?: JSX.Element;
  /** Whether to show the top border divider (omit for the first row). */
  divider?: boolean;
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
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "space-between",
        "padding-top": props.divider ? "6px" : undefined,
        "border-top": props.divider ? "1px solid var(--sys-border-light,#eaeaea)" : undefined,
        gap: "8px",
        "flex-wrap": "wrap",
      }}
    >
      <div style={{ flex: "1", "min-width": "180px" }}>
        <div class="ds-label">
          {props.label}
        </div>
        {props.desc && (
          <div class="ds-muted" style={{ "font-size": "11px", color: "var(--sys-text-muted,#666)" }}>
            {props.desc}
          </div>
        )}
      </div>
      <div style={{ "flex-shrink": "0" }}>
        {props.children}
      </div>
    </div>
  );
}
