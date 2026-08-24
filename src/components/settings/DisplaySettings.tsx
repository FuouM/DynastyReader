import { createMemo, createSignal, For, Show } from "solid-js";
import { theme, setTheme, uiScale, applyUiScale } from "../../stores";
import { t, locale, setLocale, SUPPORTED_LOCALES, type Locale } from "../../i18n";
import { browseCovers } from "../../browse/browse-covers";
import { Icon, SunIcon, MoonIcon, ImageIcon, AddIcon } from "../Icon";
import { IconText, IconButton } from "../Button";
import { SCALE_PRESETS } from "./types";

export function DisplaySettings() {
  const [scale, setScale] = createSignal(uiScale());
  const [coversEnabled, setCoversEnabledLocal] = createSignal(browseCovers.coversEnabled);

  const syncScale = (val: number): void => {
    const clamped = Math.min(2.0, Math.max(0.5, val));
    setScale(clamped);
    applyUiScale(clamped);
  };

  const toggleCovers = (): void => {
    const next = !coversEnabled();
    browseCovers.setCoversEnabled(next);
    setCoversEnabledLocal(next);
  };

  const hasScalePreset = createMemo(() =>
    SCALE_PRESETS.some((s) => Math.abs(s - scale()) < 0.01),
  );

  return (
    <div class="group-box" id="ds-settings-sec-display">
      <div class="group-box-title">
        <IconText icon={<Icon name="aspect-ratio" />}>{t("settings.display.title")}</IconText>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        {/* Scale Factor */}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <label
            for="ds-settings-scale-select"
            style="font-size:12px;color:var(--sys-window-text,#333);font-weight:600;"
          >
            {t("settings.display.uiScale")}:
          </label>
          <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
            <IconButton
              className="ds-btn-icon"
              id="ds-settings-scale-dec"
              icon={<Icon name="dash-lg" />}
              title={t("settings.display.scaleDecTooltip")}
              onClick={() => syncScale(Math.max(0.5, Math.round((scale() - 0.1) * 10) / 10))}
            />
            <select
              id="ds-settings-scale-select"
              class="input-field"
              style="width:115px;height:24px;font-size:11px;"
              value={scale()}
              onChange={(ev) => {
                const val = parseFloat((ev.target as HTMLSelectElement).value);
                if (!isNaN(val)) syncScale(val);
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
            </select>
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
        </div>

        {/* Theme Switcher */}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;color:var(--sys-window-text,#333);font-weight:600;">{t("settings.display.theme")}:</div>
          </div>
          <div class="ds-segmented-switch" id="ds-settings-theme-switch" style="flex-shrink:0;">
            <IconButton
              className={`ds-segmented-btn${theme() === "light" ? " active" : ""}`}
              id="ds-settings-theme-light"
              title={t("settings.display.themeLight")}
              icon={<SunIcon />}
              text={t("settings.display.themeLight").split(" ")[0]}
              onClick={() => setTheme("light")}
            />
            <IconButton
              className={`ds-segmented-btn${theme() === "dark" ? " active" : ""}`}
              id="ds-settings-theme-dark"
              title={t("settings.display.themeDark")}
              icon={<MoonIcon />}
              text={t("settings.display.themeDark").split(" ")[0]}
              onClick={() => setTheme("dark")}
            />
          </div>
        </div>

        {/* Feed Covers Toggle */}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;color:var(--sys-window-text,#333);font-weight:600;">
              {t("settings.display.feedCovers")}:
            </div>
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
              {t("settings.display.feedCoversDesc")}
            </div>
          </div>
          <IconButton
            className={coversEnabled() ? "primary" : undefined}
            id="ds-settings-covers-toggle"
            cssText="font-size:11px;padding:2px 10px;min-width:90px;flex-shrink:0;"
            icon={<Show when={coversEnabled()} fallback={<Icon name="eye-slash" />}><ImageIcon /></Show>}
            text={<Show when={coversEnabled()} fallback={t("settings.display.coversOff")}>{t("settings.display.coversOn")}</Show>}
            onClick={toggleCovers}
          />
        </div>

        {/* Language Selector */}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;color:var(--sys-window-text,#333);font-weight:600;">
              {t("settings.display.language")}:
            </div>
          </div>
          <select
            id="ds-settings-language-select"
            class="input-field"
            style="width:115px;height:24px;font-size:11px;flex-shrink:0;"
            value={locale()}
            onChange={(ev) => setLocale((ev.target as HTMLSelectElement).value as Locale)}
          >
            <For each={SUPPORTED_LOCALES}>
              {(loc) => (
                <option value={loc.code}>
                  {loc.label}
                </option>
              )}
            </For>
          </select>
        </div>
      </div>
    </div>
  );
}
