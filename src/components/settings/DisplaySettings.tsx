import { createMemo, createSignal, For, Show } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import { theme, setTheme, THEME_REGISTRY, uiScale, applyUiScale, uiMode, setUiMode, type UiMode, type AppTheme } from "../../stores";
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
  makeEventListener(document, "click", () => {
    document.getElementById("ds-theme-more-menu")?.classList.add("ds-hidden");
  });

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

        {/* Theme Switcher — 3 core themes on segmented, extras in dropdown (separate rows) */}
        <SettingsRow label={t("settings.display.theme")} divider>
          <div class="ds-col" style="gap: 6px; align-items: stretch;">
            <SegmentedSwitch
              id="ds-settings-theme-switch"
              value={theme()}
              onChange={(val) => setTheme(val as AppTheme)}
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
              <div class="ds-flex-row" style="gap: 6px; align-items: center; position: relative;">
                <Button
                  id="ds-settings-theme-more-select"
                  className="ds-select--w115"
                  icon={theme() === "windows7" ? <Icon name="windows" /> : <Icon name="palette" />}
                  text={(["light", "dark", "high-contrast"] as AppTheme[]).includes(theme() as AppTheme) ? "More…" : THEME_REGISTRY[theme() as AppTheme]?.label ?? "More…"}
                  title="More themes"
                  onClick={(ev: MouseEvent) => {
                    const menu = document.getElementById("ds-theme-more-menu");
                    if (menu) menu.classList.toggle("ds-hidden");
                    ev.stopPropagation();
                  }}
                />
                <div
                  id="ds-theme-more-menu"
                  class="ds-popup-card ds-hidden"
                  style="position: absolute; top: 100%; left: 0; margin-top: 4px; min-width: 160px; z-index: 100; padding: 4px; gap: 2px;"
                  onClick={(e: MouseEvent) => e.stopPropagation()}
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
                            document.getElementById("ds-theme-more-menu")?.classList.add("ds-hidden");
                          }}
                        >
                          <Icon name={isWin7 ? "windows" : "palette"} />
                          <span>{cfg.label}</span>
                        </button>
                      );
                    }}
                  </For>
                </div>
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
