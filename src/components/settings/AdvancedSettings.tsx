/**
 * Advanced settings section for DynastyReader.
 * Houses advanced runtime capabilities, hardware bridges, and haptic feedback
 * configuration with editable vibration durations and live pattern previews.
 */

import { createSignal, For, Show } from "solid-js";
import { t } from "../../i18n";
import {
  isHapticsEnabled,
  setHapticsEnabled,
  isPageTurnHapticsEnabled,
  setPageTurnHapticsEnabled,
  isOverscrollHapticsEnabled,
  setOverscrollHapticsEnabled,
  previewHaptic,
  getHapticDuration,
  setHapticDuration,
  resetHapticDuration,
  resetAllHapticDurations,
  DEFAULT_HAPTIC_DURATIONS,
  hapticStrength,
  setHapticStrength,
  resetHapticStrength,
  DEFAULT_HAPTIC_STRENGTH,
  getHapticsEngineStatus,
  getHapticTotalDurationMs,
  type HapticStyle,
} from "../../utils/haptics";
import { GroupBox } from "../GroupBox";
import { SettingsRow } from "../SettingsRow";
import { DsSwitch, IconButton, IconText } from "../Button";
import { Icon } from "../Icon";

interface HapticCardDef {
  id: HapticStyle;
  icon: string;
  min: number;
  max: number;
  step: number;
  labelKey: "tap" | "pageTurn" | "snap" | "confirm";
  descKey: "tapDesc" | "pageTurnDesc" | "snapDesc" | "confirmDesc";
}

const HAPTIC_CARDS: readonly HapticCardDef[] = [
  {
    id: "tap",
    icon: "hand-index-thumb",
    min: 5,
    max: 80,
    step: 1,
    labelKey: "tap",
    descKey: "tapDesc",
  },
  {
    id: "page-turn",
    icon: "file-earmark-diff",
    min: 5,
    max: 60,
    step: 1,
    labelKey: "pageTurn",
    descKey: "pageTurnDesc",
  },
  {
    id: "snap",
    icon: "magnet",
    min: 10,
    max: 120,
    step: 2,
    labelKey: "snap",
    descKey: "snapDesc",
  },
  {
    id: "confirm",
    icon: "check2-circle",
    min: 10,
    max: 80,
    step: 2,
    labelKey: "confirm",
    descKey: "confirmDesc",
  },
];

export function AdvancedSettings() {
  const [activePreview, setActivePreview] = createSignal<HapticStyle | null>(null);
  let previewTimeout: number | null = null;

  const handleTestHaptic = (style: HapticStyle): void => {
    if (previewTimeout !== null) {
      window.clearTimeout(previewTimeout);
      previewTimeout = null;
    }
    setActivePreview(style);
    previewHaptic(style);

    const duration = getHapticTotalDurationMs(style);
    const displayDuration = Math.max(duration + 200, 350);
    previewTimeout = window.setTimeout(() => {
      setActivePreview(null);
      previewTimeout = null;
    }, displayDuration);
  };

  const engineStatus = getHapticsEngineStatus();

  return (
    <div class="ds-advanced-view">
      <div class="ds-advanced-scroll">
    <GroupBox
      id="ds-settings-sec-advanced-view"
      title={<IconText icon={<Icon name="sliders" />}>{t("settings.advanced.title")}</IconText>}
      actions={
        <IconButton
          className="ds-btn-sm"
          icon={<Icon name="arrow-counterclockwise" />}
          text={t("settings.advanced.resetDefaults")}
          onClick={() => {
            resetAllHapticDurations();
            resetHapticStrength();
          }}
        />
      }
    >
      <div class="ds-col">
        {/* Master Haptics Switch */}
        <SettingsRow
          label={<>{t("settings.advanced.hapticsMaster")}:</>}
          desc={t("settings.advanced.hapticsMasterDesc")}
        >
          <DsSwitch
            id="ds-settings-haptics-master"
            checked={isHapticsEnabled()}
            title={isHapticsEnabled() ? t("settings.advanced.hapticsOn") : t("settings.advanced.hapticsOff")}
            onChange={setHapticsEnabled}
          />
        </SettingsRow>

        {/* Granular: Page Turn Haptics */}
        <SettingsRow
          divider
          label={<>{t("settings.advanced.pageTurnHaptics")}:</>}
          desc={t("settings.advanced.pageTurnHapticsDesc")}
        >
          <DsSwitch
            id="ds-settings-haptics-pageturn"
            checked={isPageTurnHapticsEnabled()}
            disabled={!isHapticsEnabled()}
            title={isPageTurnHapticsEnabled() ? t("settings.advanced.pageTurnHapticsOn") : t("settings.advanced.pageTurnHapticsOff")}
            onChange={setPageTurnHapticsEnabled}
          />
        </SettingsRow>

        {/* Granular: Chapter Overscroll Haptics */}
        <SettingsRow
          divider
          label={<>{t("settings.advanced.overscrollHaptics")}:</>}
          desc={t("settings.advanced.overscrollHapticsDesc")}
        >
          <DsSwitch
            id="ds-settings-haptics-overscroll"
            checked={isOverscrollHapticsEnabled()}
            disabled={!isHapticsEnabled()}
            title={isOverscrollHapticsEnabled() ? t("settings.advanced.overscrollHapticsOn") : t("settings.advanced.overscrollHapticsOff")}
            onChange={setOverscrollHapticsEnabled}
          />
        </SettingsRow>

        {/* Vibration Strength & Intensity */}
        <SettingsRow
          divider
          stacked
          label={<>{t("settings.advanced.strengthLabel")}:</>}
          desc={t("settings.advanced.strengthDesc")}
        >
          <div class="ds-haptic-strength-container">
            <div class="ds-haptic-strength-row">
              <input
                type="range"
                class="ds-haptic-slider ds-haptic-strength-slider"
                min={1}
                max={100}
                step={1}
                disabled={!isHapticsEnabled()}
                value={hapticStrength()}
                onInput={(e) => setHapticStrength(Number(e.currentTarget.value))}
              />
              <span class="ds-haptic-strength-readout">
                {hapticStrength()}%
              </span>
            </div>
            <div class="ds-haptic-strength-presets">
              <button
                type="button"
                class="win-button ds-haptic-preset-btn"
                classList={{ active: hapticStrength() === 35 }}
                disabled={!isHapticsEnabled()}
                onClick={() => setHapticStrength(35)}
              >
                {t("settings.advanced.strengthLight")}
              </button>
              <button
                type="button"
                class="win-button ds-haptic-preset-btn"
                classList={{ active: hapticStrength() === 65 }}
                disabled={!isHapticsEnabled()}
                onClick={() => setHapticStrength(65)}
              >
                {t("settings.advanced.strengthMedium")}
              </button>
              <button
                type="button"
                class="win-button ds-haptic-preset-btn"
                classList={{ active: hapticStrength() === 100 }}
                disabled={!isHapticsEnabled()}
                onClick={() => setHapticStrength(100)}
              >
                {t("settings.advanced.strengthStrong")}
              </button>
              <Show when={hapticStrength() !== DEFAULT_HAPTIC_STRENGTH}>
                <button
                  type="button"
                  class="win-button ds-haptic-preset-btn"
                  title="Reset to default 85%"
                  onClick={resetHapticStrength}
                >
                  <Icon name="arrow-counterclockwise" size={11} /> 85%
                </button>
              </Show>
            </div>
          </div>
        </SettingsRow>

        {/* Interactive Pattern Preview & Duration Editing */}
        <SettingsRow
          divider
          stacked
          label={t("settings.advanced.previewTitle")}
          desc={t("settings.advanced.previewDesc")}
        >
          <div class="ds-haptic-preview-grid">
            <For each={HAPTIC_CARDS}>
              {(card) => {
                const isTesting = () => activePreview() === card.id;
                const currentDuration = () => getHapticDuration(card.id);
                const defaultDuration = DEFAULT_HAPTIC_DURATIONS[card.id];
                const isCustomized = () => currentDuration() !== defaultDuration;

                const stepDown = () => setHapticDuration(card.id, currentDuration() - card.step);
                const stepUp = () => setHapticDuration(card.id, currentDuration() + card.step);

                return (
                  <div
                    class="ds-haptic-card"
                    classList={{ "ds-haptic-card--active": isTesting() }}
                  >
                    <div class="ds-haptic-card-header">
                      <span class="ds-haptic-card-title">
                        <Icon name={card.icon} />
                        {t(`settings.advanced.styles.${card.labelKey}`)}
                      </span>
                      <div class="ds-haptic-card-timing">
                        <span class="ds-haptic-badge">{currentDuration()} ms</span>
                        <Show when={isCustomized()}>
                          <button
                            type="button"
                            class="win-button ds-haptic-reset-mini"
                            title={t("settings.advanced.resetStyleTooltip", { defaultVal: String(defaultDuration) })}
                            onClick={() => resetHapticDuration(card.id)}
                          >
                            <Icon name="arrow-counterclockwise" size={10} />
                          </button>
                        </Show>
                      </div>
                    </div>

                    <div class="ds-haptic-card-desc">
                      {t(`settings.advanced.styles.${card.descKey}`)}
                    </div>

                    {/* Duration Editing Slider + Step Buttons */}
                    <div class="ds-haptic-editor-row">
                      <button
                        type="button"
                        class="win-button ds-haptic-step-btn"
                        disabled={currentDuration() <= card.min}
                        onClick={stepDown}
                        title="-1 ms"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        class="ds-haptic-slider"
                        min={card.min}
                        max={card.max}
                        step={card.step}
                        value={currentDuration()}
                        onInput={(e) => setHapticDuration(card.id, Number(e.currentTarget.value))}
                      />
                      <button
                        type="button"
                        class="win-button ds-haptic-step-btn"
                        disabled={currentDuration() >= card.max}
                        onClick={stepUp}
                        title="+1 ms"
                      >
                        +
                      </button>
                    </div>

                    <div class="ds-haptic-card-footer">
                      <span class="ds-muted" style={{ "font-size": "10.5px" }}>
                        {isTesting() ? (
                          <span style={{ color: "var(--sys-highlight-bg, #0078d7)", "font-weight": "600" }}>
                            <Icon name="soundwave" class="ds-haptic-pulse-icon" /> {t("settings.advanced.testingActive")}
                          </span>
                        ) : (
                          <span>
                            {card.id === "confirm" ? `2× ${currentDuration()} ms` : `${currentDuration()} ms`}
                          </span>
                        )}
                      </span>

                      <IconButton
                        className="ds-haptic-test-btn"
                        icon={<Icon name={isTesting() ? "soundwave" : "play-fill"} class={isTesting() ? "ds-haptic-pulse-icon" : undefined} />}
                        text={t("settings.advanced.testButton")}
                        onClick={() => handleTestHaptic(card.id)}
                      />
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </SettingsRow>

        {/* Engine Status Diagnostic */}
        <SettingsRow
          divider
          label={t("settings.advanced.engineStatus")}
          desc={t("settings.advanced.engineStatusDesc")}
        >
          <div
            class="ds-haptic-engine-badge"
            classList={{
              active: engineStatus !== "unsupported",
              unsupported: engineStatus === "unsupported",
            }}
          >
            <Icon
              name={
                engineStatus === "android-bridge"
                  ? "phone-fill"
                  : engineStatus === "web-vibration"
                    ? "activity"
                    : "laptop"
              }
            />
            <span>
              {engineStatus === "android-bridge"
                ? t("settings.advanced.engineAndroidBridge")
                : engineStatus === "web-vibration"
                  ? t("settings.advanced.engineWebVibration")
                  : t("settings.advanced.engineUnsupported")}
            </span>
          </div>
        </SettingsRow>
      </div>
        </GroupBox>
      </div>
    </div>
  );
}
