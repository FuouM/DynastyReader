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
import {
  SETTINGS_SECTIONS,
  SettingsSidebar,
  DisplaySettings,
  BlacklistSettings,
  ReaderSettings,
  HotkeysSection,
  StorageSettings,
  AboutSettings,
  type SettingsSectionId,
} from "./settings";

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal(props: SettingsModalProps) {
  const [currentPage, setCurrentPage] = createSignal<"main" | "hotkeys">("main");
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
          <Icon name="gear-fill" /> Application Settings
        </>
      }
      width={680}
      onClose={props.onClose}
      footer={
        <div style="display:flex;justify-content:flex-end;width:100%;">
          <button
            type="button"
            class="win-button primary ds-modal-done"
            id="ds-settings-done-btn"
            style="min-width:70px;"
            onClick={props.onClose}
          >
            Done
          </button>
        </div>
      }
    >
      <Show
        when={currentPage() === "hotkeys"}
        fallback={
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
              <div class="group-box" id="ds-settings-sec-hotkeys">
                <div class="group-box-title">
                  <Icon name="keyboard" /> Keyboard Shortcuts
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 0;">
                  <div>
                    <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">
                      Custom Hotkeys &amp; Keybindings
                    </div>
                    <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
                      Configure custom hotkeys for reading controls, page navigation, and app actions.
                    </div>
                  </div>
                  <button
                    type="button"
                    class="win-button"
                    id="ds-settings-open-hotkeys"
                    style="font-size:11px;padding:3px 10px;flex-shrink:0;display:inline-flex;align-items:center;gap:6px;"
                    onClick={() => setCurrentPage("hotkeys")}
                  >
                    <Icon name="keyboard" /> Configure Shortcuts...
                  </button>
                </div>
              </div>

              <StorageSettings onClose={props.onClose} />
              <AboutSettings />
            </div>
          </div>
        }
      >
        <div class="ds-settings-subpage">
          <div class="ds-settings-subpage-header">
            <button
              type="button"
              class="win-button ds-btn-sm"
              style="display:inline-flex;align-items:center;gap:5px;font-weight:600;"
              onClick={() => setCurrentPage("main")}
            >
              <Icon name="arrow-left" /> Back to Settings
            </button>
            <span style="font-size:11px;color:var(--sys-text-muted,#666);">
              All changes are saved automatically.
            </span>
          </div>
          <div class="ds-settings-subpage-content">
            <HotkeysSection active={props.open && currentPage() === "hotkeys"} />
          </div>
        </div>
      </Show>
    </Modal>
  );
}
