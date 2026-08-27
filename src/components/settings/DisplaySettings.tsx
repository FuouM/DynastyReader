import { createMemo, createSignal, For, Show } from "solid-js";
import { theme, setTheme, uiScale, applyUiScale, uiMode, setUiMode, type UiMode } from "../../stores";
import { t, locale, setLocale, SUPPORTED_LOCALES, type Locale } from "../../i18n";
import { browseCovers } from "../../browse/browse-covers";
import { Icon, SunIcon, MoonIcon, OledIcon, AddIcon } from "../Icon";
import { DsSelect, IconText, IconButton, SegmentedSwitch, DsSwitch } from "../Button";
import { SettingsRow } from "../SettingsRow";
import { GroupBox } from "../GroupBox";
import { SCALE_PRESETS } from "./types";
export function DisplaySettings() {
  const [scale, setScale] = createSignal(uiScale());
  const [coversEnabled, setCoversEnabledLocal] = createSignal(browseCovers.coversEnabled);

  const syncScale = (val: number): void => {
    const clamped = Math.min(2.0, Math.max(0.5, val));
    setScale(clamped);
    applyUiScale(clamped);
  };

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

        {/* Theme Switcher */}
        <SettingsRow
          label={t("settings.display.theme")}
          divider
        >
        <SegmentedSwitch
          id="ds-settings-theme-switch"
          value={theme()}
          onChange={(val) => setTheme(val as "light" | "dark" | "high-contrast")}
          options={[
            { id: "ds-settings-theme-light", value: "light", icon: <SunIcon />, text: t("settings.display.themeLight").split(" ")[0], title: t("settings.display.themeLight") },
            { id: "ds-settings-theme-dark", value: "dark", icon: <MoonIcon />, text: t("settings.display.themeDark").split(" ")[0], title: t("settings.display.themeDark") },
            { id: "ds-settings-theme-hc", value: "high-contrast", icon: <OledIcon />, text: t("settings.display.themeHighContrast").split(" ")[0], title: t("settings.display.themeHighContrast") },
          ]}
        />
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
