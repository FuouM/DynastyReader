/**
 * Settings modal dialog for DynastyReader.
 * Orchestrates modular settings sections:
 * - Display & Scaling
 * - Tag Blacklist
 * - Reading & Cache
 * - Keyboard Shortcuts (drill-down subpage)
 * - Storage & Cache Management
 * - About DynastyReader & Updater
 */

import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { IconText, IconButton } from "./Button";
import { GroupBox } from "./GroupBox";
import { t } from "../i18n";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./settings/types";
import { SettingsSidebar } from "./settings/SettingsSidebar";
import { DisplaySettings } from "./settings/DisplaySettings";
import { BlacklistSettings } from "./settings/BlacklistSettings";
import { ReaderSettings } from "./settings/ReaderSettings";
import { HotkeysSection } from "./settings/HotkeySettings";
import { StorageSettings } from "./settings/StorageSettings";
import { AdvancedSettings } from "./settings/AdvancedSettings";
import { AboutSettings } from "./settings/AboutSettings";

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal(props: SettingsModalProps) {
  const [currentPage, setCurrentPage] = createSignal<"main" | "hotkeys" | "advanced">("main");
  const [activeSection, setActiveSection] = createSignal<SettingsSectionId>("display");

  let contentRef: HTMLDivElement | undefined;
  let isProgrammaticScroll = false;
  let scrollTimer: number | null = null;

  createEffect(() => {
    if (!props.open) {
      setCurrentPage("main");
      return;
    }
    setActiveSection("display");
    setCurrentPage("main");
  });

  const scrollToSection = (id: SettingsSectionId): void => {
    if (currentPage() !== "main") {
      setCurrentPage("main");
    }
    setActiveSection(id);
    if (!contentRef) return;
    const target = contentRef.querySelector(`#ds-settings-sec-${id}`) as HTMLElement | null;
    if (target) {
      isProgrammaticScroll = true;
      if (scrollTimer !== null) clearTimeout(scrollTimer);
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      scrollTimer = window.setTimeout(() => {
        isProgrammaticScroll = false;
      }, 400);
    }
  };

  onCleanup(() => {
    if (scrollTimer) window.clearTimeout(scrollTimer);
  });

  const handleScroll = (): void => {
    if (isProgrammaticScroll || !contentRef) return;
    const containerRect = contentRef.getBoundingClientRect();

    let currentId: SettingsSectionId = SETTINGS_SECTIONS[0].id;
    for (const sec of SETTINGS_SECTIONS) {
      const el = contentRef.querySelector(`#ds-settings-sec-${sec.id}`) as HTMLElement | null;
      if (el) {
        const relativeTop = el.getBoundingClientRect().top - containerRect.top;
        if (relativeTop <= 60) {
          currentId = sec.id;
        }
      }
    }
    setActiveSection(currentId);
  };

  return (
    <Modal
      open={props.open}
      backdropId="ds-settings-modal-backdrop"
      title={
        <>
          <IconText icon={<Icon name="gear-fill" />}>{t("settings.title")}</IconText>
        </>
      }
      width={680}
      onClose={props.onClose}
      footer={
        <div class="ds-modal-footer-end">
          <button type="button" class="win-button primary ds-modal-done" id="ds-settings-done-btn" onClick={props.onClose}>
            {t("settings.done")}
          </button>
        </div>
      }
    >
      <Show when={currentPage() === "main"}>
        <div class="ds-settings-layout">
          <SettingsSidebar
            activeSection={activeSection()}
            onSelect={scrollToSection}
          />

          <div class="ds-settings-content" ref={contentRef} onScroll={handleScroll}>
            <DisplaySettings />
            <BlacklistSettings />
            <ReaderSettings />

            {/* Hotkeys Section trigger banner */}
            <GroupBox id="ds-settings-sec-hotkeys" title={<IconText icon={<Icon name="keyboard" />}>{t("settings.sections.hotkeys")}</IconText>}>
              <div class="ds-row-between">
                <div class="ds-label">
                  {t("settings.hotkeys.bannerTitle")}
                </div>
                <IconButton
                  className=""
                  id="ds-settings-open-hotkeys"
                  cssText="font-size:11px;padding:3px 10px;flex-shrink:0;display:inline-flex;align-items:center;gap:4px;"
                  icon={<Icon name="keyboard" />}
                  text={t("settings.openHotkeysModal")}
                  onClick={() => setCurrentPage("hotkeys")}
                />
              </div>
            </GroupBox>

            <StorageSettings onClose={props.onClose} />

            {/* Advanced Section trigger banner */}
            <GroupBox id="ds-settings-sec-advanced" title={<IconText icon={<Icon name="sliders" />}>{t("settings.sections.advanced")}</IconText>}>
              <div class="ds-row-between">
                <div class="ds-label">
                  {t("settings.advanced.bannerTitle")}
                </div>
                <IconButton
                  className=""
                  id="ds-settings-open-advanced"
                  cssText="font-size:11px;padding:3px 10px;flex-shrink:0;display:inline-flex;align-items:center;gap:4px;"
                  icon={<Icon name="sliders" />}
                  text={t("settings.advanced.openAdvancedButton")}
                  onClick={() => setCurrentPage("advanced")}
                />
              </div>
            </GroupBox>

            <AboutSettings />
          </div>
        </div>
      </Show>

      <Show when={currentPage() === "hotkeys"}>
        <div class="ds-settings-subpage">
          <div class="ds-settings-subpage-header">
            <IconButton
              className="ds-btn-sm"
              cssText="display:inline-flex;align-items:center;gap:4px;font-weight:600;"
              icon={<Icon name="arrow-left" />}
              text={t("settings.backToSettings")}
              onClick={() => setCurrentPage("main")}
            />
            <span class="ds-muted">
              {t("settings.hotkeys.autoSavedNotice")}
            </span>
          </div>
          <div class="ds-settings-subpage-content">
            <HotkeysSection active={props.open && currentPage() === "hotkeys"} />
          </div>
        </div>
      </Show>

      <Show when={currentPage() === "advanced"}>
        <div class="ds-settings-subpage">
          <div class="ds-settings-subpage-header">
            <IconButton
              className="ds-btn-sm"
              cssText="display:inline-flex;align-items:center;gap:4px;font-weight:600;"
              icon={<Icon name="arrow-left" />}
              text={t("settings.backToSettings")}
              onClick={() => setCurrentPage("main")}
            />
            <span class="ds-muted">
              {t("settings.advanced.subpageNotice")}
            </span>
          </div>
          <div class="ds-settings-subpage-content" style={{ "overflow-y": "auto", height: "100%", padding: "4px 8px", "box-sizing": "border-box" }}>
            <AdvancedSettings />
          </div>
        </div>
      </Show>
    </Modal>
  );
}
