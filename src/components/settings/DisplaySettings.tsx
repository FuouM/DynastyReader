import { createMemo, createSignal, For, Show } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import {
  theme,
  setTheme,
  THEME_REGISTRY,
  accentColor,
  setAccentColor,
  ACCENT_COLOR_PRESETS,
  getContrastText,
  uiScale,
  setUiScale,
  uiMode,
  setUiMode,
  type UiMode,
  type AppTheme,
} from "../../stores";
import { t, locale, setLocale, SUPPORTED_LOCALES, type Locale } from "../../i18n";
import { browseCovers } from "../../browse/browse-covers";
import { Icon, SunIcon, MoonIcon, OledIcon, AddIcon } from "../Icon";
import { DsSelect, IconText, IconButton, SegmentedSwitch, DsSwitch, Button } from "../Button";
import { SettingsRow } from "../SettingsRow";
import { GroupBox } from "../GroupBox";
import { SCALE_PRESETS } from "./types";
export function DisplaySettings() {
  const [scale, setScale] = createSignal(uiScale());
  const [coversEnabled, setCoversEnabledLocal] = createSignal(browseCovers.coversEnabled);
  const [moreOpen, setMoreOpen] = createSignal(false);
  let moreContainerRef: HTMLDivElement | undefined;

  makeEventListener(document, "click", (ev: MouseEvent) => {
    if (moreContainerRef && !moreContainerRef.contains(ev.target as Node)) {
      setMoreOpen(false);
    }
  });

  const syncScale = (val: number): void => {
    const clamped = Math.min(2.0, Math.max(0.5, val));
    setScale(clamped);
    setUiScale(clamped);
  };

  const isCustomColor = createMemo(() => {
    const cur = accentColor();
    if (!cur || cur === "default") return false;
    return !ACCENT_COLOR_PRESETS.some((p) => p.hex.toLowerCase() === cur.toLowerCase());
  });
  const activeColorLabel = createMemo(() => {
    const cur = accentColor();
    if (!cur || cur === "default") return "Blue (Default)";
    const found = ACCENT_COLOR_PRESETS.find((p) => p.hex.toLowerCase() === cur.toLowerCase());
    if (found) return found.label;
    return `Custom (${cur.toUpperCase()})`;
  });
  const hasScalePreset = createMemo(() =>
    SCALE_PRESETS.some((s) => Math.abs(s - scale()) < 0.01),
  );

  return (
    <GroupBox id="ds-settings-sec-display" title={<IconText icon={<Icon name="aspect-ratio" />}>{t("settings.display.title")}</IconText>}>
      <div class="ds-col">
        {/* Scale Factor */}
        <SettingsRow
          label={t("settings.display.uiScale")}
        >
          <div class="ds-settings-scale-controls">
            <IconButton
              className="ds-btn-icon"
              id="ds-settings-scale-dec"
              icon={<Icon name="dash-lg" />}
              title={t("settings.display.scaleDecTooltip")}
              onClick={() => syncScale(Math.max(0.5, Math.round((scale() - 0.1) * 10) / 10))}
            />
            <DsSelect
              id="ds-settings-scale-select"
              className="ds-select--w115"
              value={String(scale())}
              onChange={(val) => {
                const num = parseFloat(val);
                if (!isNaN(num)) syncScale(num);
              }}
            >
              <For each={SCALE_PRESETS}>
                {(s) => (
                  <option value={s}>
                    {s === 1.0
                      ? t("settings.display.scaleDefaultPreset", { pct: Math.round(s * 100) })
                      : `${Math.round(s * 100)}%`}
                  </option>
                )}
              </For>
              <Show when={!hasScalePreset()}>
                <option value={scale()} selected>
                  {t("settings.display.scaleCustomPreset", { pct: Math.round(scale() * 100) })}
                </option>
              </Show>
            </DsSelect>
            <IconButton
              className="ds-btn-icon"
              id="ds-settings-scale-inc"
              icon={<AddIcon />}
              title={t("settings.display.scaleIncTooltip")}
              onClick={() => syncScale(Math.min(2.0, Math.round((scale() + 0.1) * 10) / 10))}
            />
            <button
              type="button"
              class="win-button ds-btn-sm"
              id="ds-settings-scale-reset"
              title={t("settings.display.scaleResetTooltip")}
              onClick={() => syncScale(1.0)}
            >
              100%
            </button>
          </div>
        </SettingsRow>

        {/* Theme Switcher — 3 core themes on segmented, extras in dropdown (separate rows) */}
        <SettingsRow label={t("settings.display.theme")} divider>
          <div class="ds-col" style="gap: 6px; align-items: stretch;">
            <SegmentedSwitch
              id="ds-settings-theme-switch"
              value={theme()}
              onChange={(val) => {
                setTheme(val as AppTheme);
                setMoreOpen(false);
              }}
              options={(["light", "dark", "high-contrast"] as AppTheme[]).map((value) => {
                const cfg = THEME_REGISTRY[value];
                const isLight = value === "light";
                const isDark = value === "dark";
                return {
                  id: `ds-settings-theme-${value}`,
                  value,
                  icon: isLight ? <SunIcon /> : isDark ? <MoonIcon /> : <OledIcon />,
                  text: value === "high-contrast" ? "High" : cfg.label.split(" ")[0],
                  title: cfg.label,
                };
              })}
            />
            <Show when={(Object.keys(THEME_REGISTRY) as AppTheme[]).filter((v) => !["light", "dark", "high-contrast"].includes(v)).length > 0}>
              <div ref={moreContainerRef} class="ds-flex-row" style="gap: 6px; align-items: center; position: relative;">
                <Button
                  id="ds-settings-theme-more-select"
                  className="ds-select--w115"
                  icon={theme() === "windows7" ? <Icon name="windows" /> : <Icon name="palette" />}
                  text={(["light", "dark", "high-contrast"] as AppTheme[]).includes(theme() as AppTheme) ? t("settings.display.moreThemes") : THEME_REGISTRY[theme() as AppTheme]?.label ?? t("settings.display.moreThemes")}
                  title={t("settings.display.moreThemesTooltip")}
                  onClick={() => setMoreOpen(!moreOpen())}
                />
                <Show when={moreOpen()}>
                  <div
                    id="ds-theme-more-menu"
                    class="ds-popup-card"
                    style="position: absolute; top: 100%; left: 0; margin-top: 4px; min-width: 160px; z-index: 100; padding: 4px; gap: 2px;"
                  >
                    <For each={(Object.keys(THEME_REGISTRY) as AppTheme[]).filter((v) => !["light", "dark", "high-contrast"].includes(v))}>
                      {(value) => {
                        const cfg = THEME_REGISTRY[value];
                        const isWin7 = value === "windows7";
                        const isActive = theme() === value;
                        return (
                          <button
                            type="button"
                            class={`ds-settings-nav-item${isActive ? " active" : ""}`}
                            style="width: 100%; justify-content: flex-start;"
                            onClick={() => {
                              setTheme(value);
                              setMoreOpen(false);
                            }}
                          >
                            <Icon name={isWin7 ? "windows" : "palette"} />
                            <span>{cfg.label}</span>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </SettingsRow>
        {/* Accent Color Palette — authentic WinForms square color wells */}
        <SettingsRow
          label={t("settings.display.accentColor")}
          desc={t("settings.display.accentColorDesc")}
          divider
        >
          <div class="ds-col" style="gap: 5px; align-items: flex-end;">
            <div class="ds-winforms-palette">
              <For each={ACCENT_COLOR_PRESETS}>
                {(preset) => {
                  const isSelected = () => {
                    const cur = accentColor();
                    if (preset.id === "default") {
                      return !cur || cur === "default" || cur === preset.hex.toLowerCase();
                    }
                    return cur === preset.hex.toLowerCase();
                  };
                  return (
                    <button
                      type="button"
                      class={`ds-winforms-color-cell${isSelected() ? " is-active" : ""}`}
                      style={{ "background-color": preset.hex }}
                      title={preset.label}
                      onClick={() => setAccentColor(preset.id === "default" ? "default" : preset.hex)}
                    >
                      <Show when={isSelected()}>
                        <i class="bi bi-check" style={{ color: getContrastText(preset.hex) }} />
                      </Show>
                    </button>
                  );
                }}
              </For>

              {/* Custom Color Well */}
              <label
                class={`ds-winforms-color-cell ds-winforms-color-cell--custom${isCustomColor() ? " is-active" : ""}`}
                style={{
                  "background-color": isCustomColor() ? accentColor() : "transparent",
                  color: isCustomColor() ? getContrastText(accentColor()) : "var(--sys-window-text, #333)",
                }}
                title={t("settings.display.accentCustomTooltip")}
              >
                <input
                  type="color"
                  class="ds-accent-color-native-input"
                  value={isCustomColor() ? accentColor() : "#0078d4"}
                  onInput={(e) => setAccentColor(e.currentTarget.value)}
                />
                <Show when={isCustomColor()} fallback={<i class="bi bi-palette" />}>
                  <i class="bi bi-check" />
                </Show>
              </label>
            </div>

            {/* Custom Color Status / Reset (when non-default) */}
            <Show when={isCustomColor() || (accentColor() && accentColor() !== "default")}>
              <div class="ds-accent-custom-label">
                <span class="ds-accent-hex-pill">{activeColorLabel()}</span>
                <button
                  type="button"
                  class="win-button ds-btn-sm"
                  style="height: 18px; min-height: 18px; padding: 0 6px; font-size: 10px;"
                  onClick={() => setAccentColor("default")}
                >
                  {t("settings.display.accentDefault")}
                </button>
              </div>
            </Show>
          </div>
        </SettingsRow>

        {/* Feed Covers Toggle */}
        <SettingsRow
          label={t("settings.display.feedCovers")}
          desc={t("settings.display.feedCoversDesc")}
          divider
        >
          <DsSwitch
            id="ds-settings-covers-toggle"
            checked={coversEnabled()}
            title={coversEnabled() ? t("settings.display.coversOn") : t("settings.display.coversOff")}
            onChange={(next) => { browseCovers.setCoversEnabled(next); setCoversEnabledLocal(next); }}
          />
        </SettingsRow>

        {/* Language Selector */}
        <SettingsRow
          label={t("settings.display.language")}
          divider
        >
          <DsSelect
            id="ds-settings-language-select"
            className="ds-select--w115"
            value={locale()}
            onChange={(val) => setLocale(val as Locale)}
          >
            <For each={SUPPORTED_LOCALES}>
              {(loc) => (
                <option value={loc.code}>
                  {loc.label}
                </option>
              )}
            </For>
          </DsSelect>
        </SettingsRow>

        {/* Interface Layout (Auto / Desktop / Mobile) */}
        <SettingsRow
          label={t("settings.display.uiMode")}
          desc={t("settings.display.uiModeDesc")}
          divider
        >
          <SegmentedSwitch
            id="ds-settings-uimode-switch"
            value={uiMode()}
            onChange={(val) => setUiMode(val as UiMode)}
            options={[
              { id: "ds-settings-uimode-auto", value: "auto", icon: <Icon name="display" />, text: t("settings.display.uiModeAuto"), title: t("settings.display.uiModeAutoTooltip") },
              { id: "ds-settings-uimode-desktop", value: "desktop", icon: <Icon name="pc-display" />, text: t("settings.display.uiModeDesktop"), title: t("settings.display.uiModeDesktopTooltip") },
              { id: "ds-settings-uimode-mobile", value: "mobile", icon: <Icon name="phone" />, text: t("settings.display.uiModeMobile"), title: t("settings.display.uiModeMobileTooltip") },
            ]}
          />
        </SettingsRow>
      </div>
    </GroupBox>
  );
}
