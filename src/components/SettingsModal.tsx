/**
 * Settings modal dialog for DynastyReader. Port of `settings-modal.ts`:
 * - UI Scale multiplier (75% to 150%, persisted in localStorage)
 * - Navigation shortcut to Cache Management
 * - General preferences
 */

import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js";
import { navigate, theme, setTheme, uiScale, applyUiScale } from "../stores";
import {
  addBlacklistedTag,
  getBlacklistedTags,
  removeBlacklistedTag,
  getBlacklistMode,
  setBlacklistMode,
  type BlacklistedTag,
} from "../db";
import { openExternal, suggest } from "../api";
import { browseCovers } from "../browse/browse-covers";
import {
  isAutoCacheChapterEnabled,
  setAutoCacheChapterEnabled,
  getPrefetchBuffer,
  setPrefetchBuffer,
  getReaderNavPosition,
  setReaderNavPosition,
} from "../reader/settings";
import { Typeahead } from "./Typeahead";
import { Modal } from "./Modal";
import { ExternalLinkButton } from "./ExternalLinkButton";
import {
  SettingsIcon,
  SunIcon,
  MoonIcon,
  ImageIcon,
  BlacklistIcon,
  AddIcon,
  CloseIcon,
  DoublePageIcon,
  CloudDownloadIcon,
  StorageIcon,
  ExternalLinkIcon,
  RefreshIcon,
  Icon,
  type BootstrapIconName,
} from "./Icon";
import { checkUpdates } from "./UpdateDialog";
import { HotkeysModal } from "./HotkeysModal";
import * as ipc from "../ipc";

const SCALE_PRESETS = [0.75, 0.85, 1.0, 1.15, 1.25, 1.5];

export interface SettingsSection {
  id: string;
  label: string;
  icon: BootstrapIconName;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "display", label: "Display & Scaling", icon: "aspect-ratio" },
  { id: "blacklist", label: "Tag Blacklist", icon: "shield-slash" },
  { id: "reading", label: "Reading & Cache", icon: "book" },
  { id: "hotkeys", label: "Keyboard Shortcuts", icon: "keyboard" },
  { id: "storage", label: "Storage & Cache", icon: "hdd-stack" },
  { id: "about", label: "About DynastyReader", icon: "info-circle" },
];

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal(props: SettingsModalProps) {
  const [scale, setScale] = createSignal(uiScale());
  const [coversEnabled, setCoversEnabledLocal] = createSignal(browseCovers.coversEnabled);
  const [autoCacheEnabled, setAutoCacheEnabled] = createSignal(isAutoCacheChapterEnabled());
  const [prefetchBuffer, setPrefetchBufferLocal] = createSignal(getPrefetchBuffer());
  const [navPosition, setNavPosition] = createSignal(getReaderNavPosition());
  const [blMode, setBlMode] = createSignal(getBlacklistMode());
  const [blInput, setBlInput] = createSignal("");
  const [checking, setChecking] = createSignal(false);
  const [hotkeysOpen, setHotkeysOpen] = createSignal(false);
  const [activeSection, setActiveSection] = createSignal<string>("display");

  let contentRef: HTMLDivElement | undefined;
  let isProgrammaticScroll = false;
  let scrollTimer: number | null = null;

  const [blacklist, { refetch }] = createResource(() => props.open, () => getBlacklistedTags());

  createEffect(() => {
    if (!props.open) return;
    setScale(uiScale());
    setCoversEnabledLocal(browseCovers.coversEnabled);
    setAutoCacheEnabled(isAutoCacheChapterEnabled());
    setPrefetchBufferLocal(getPrefetchBuffer());
    setNavPosition(getReaderNavPosition());
    setBlMode(getBlacklistMode());
    setActiveSection("display");
  });

  const scrollToSection = (id: string): void => {
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

  const handleScroll = (): void => {
    if (isProgrammaticScroll || !contentRef) return;
    const containerTop = contentRef.scrollTop;
    const containerOffset = contentRef.offsetTop;

    let currentId = SETTINGS_SECTIONS[0].id;
    for (const sec of SETTINGS_SECTIONS) {
      const el = contentRef.querySelector(`#ds-settings-sec-${sec.id}`) as HTMLElement | null;
      if (el) {
        const top = el.offsetTop - containerOffset;
        if (top <= containerTop + 50) {
          currentId = sec.id;
        }
      }
    }
    setActiveSection(currentId);
  };

  const hasScalePreset = createMemo(() => SCALE_PRESETS.some((s) => Math.abs(s - scale()) < 0.01));

  const syncScale = (next: number): void => {
    applyUiScale(next);
    setScale(next);
  };

  const toggleCovers = (): void => {
    browseCovers.setCoversEnabled(!browseCovers.coversEnabled);
    setCoversEnabledLocal(browseCovers.coversEnabled);
  };

  const addTag = async (name: string, permalink?: string): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await addBlacklistedTag(trimmed, permalink);
    setBlInput("");
    void refetch();
  };

  const removeTag = async (tagName: string): Promise<void> => {
    await removeBlacklistedTag(tagName);
    void refetch();
  };

  const setMode = (mode: "hide" | "warn"): void => {
    setBlacklistMode(mode);
    setBlMode(mode);
  };

  const runCheckUpdates = async (): Promise<void> => {
    if (checking()) return;
    setChecking(true);
    try {
      await checkUpdates(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal
      open={props.open}
      backdropId="ds-settings-modal-backdrop"
      title={<><SettingsIcon /> Application Settings</>}
      width={640}
      onClose={props.onClose}
      footer={
        <div style="display:flex;justify-content:flex-end;gap:8px;width:100%;">
          <button type="button" class="win-button primary ds-modal-done" style="min-width:70px;" onClick={props.onClose}>
            Done
          </button>
        </div>
      }
    >
      <div class="ds-settings-layout">
        {/* Left Quick-Jump Navigation Sidebar */}
        <div class="ds-settings-sidebar">
          <For each={SETTINGS_SECTIONS}>
            {(sec) => (
              <button
                type="button"
                class="ds-settings-nav-item"
                classList={{ active: activeSection() === sec.id }}
                title={`Jump to ${sec.label}`}
                onClick={() => scrollToSection(sec.id)}
              >
                <Icon name={sec.icon} />
                <span>{sec.label}</span>
              </button>
            )}
          </For>
        </div>

        {/* Right Scrollable Settings Content Panel */}
        <div class="ds-settings-content" ref={contentRef} onScroll={handleScroll}>
          <div class="group-box" id="ds-settings-sec-display">
            <div class="group-box-title"><Icon name="aspect-ratio" /> Display &amp; Scaling</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <label for="ds-settings-scale-select" style="font-size:12px;color:var(--sys-window-text,#333);font-weight:600;">UI Scale Factor:</label>
              <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                <button type="button" class="win-button ds-btn-sm" id="ds-settings-scale-dec" title="Decrease Scale (-10%)" onClick={() => syncScale(Math.max(0.5, Math.round((scale() - 0.1) * 10) / 10))}>
                  <Icon name="dash-lg" />
                </button>
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
                      <option value={s}>{Math.round(s * 100)}%{s === 1.0 ? " (Default)" : ""}</option>
                    )}
                  </For>
                  <Show when={!hasScalePreset()}>
                    <option value={scale()} selected>{Math.round(scale() * 100)}% (Custom)</option>
                  </Show>
                </select>
                <button type="button" class="win-button ds-btn-sm" id="ds-settings-scale-inc" title="Increase Scale (+10%)" onClick={() => syncScale(Math.min(2.0, Math.round((scale() + 0.1) * 10) / 10))}>
                  <AddIcon />
                </button>
                <button type="button" class="win-button ds-btn-sm" id="ds-settings-scale-reset" title="Reset to 100%" onClick={() => syncScale(1.0)}>
                  100%
                </button>
              </div>
            </div>
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
              Scales all application typography, panels, buttons, and navigation controls.
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;color:var(--sys-window-text,#333);font-weight:600;">Theme:</div>
                <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">Switch the entire application between light and dark mode.</div>
              </div>
              <div class="ds-segmented-switch" id="ds-settings-theme-switch" style="flex-shrink:0;">
                <button type="button" class={`ds-segmented-btn${theme() === "light" ? " active" : ""}`} id="ds-settings-theme-light" title="Light theme" onClick={() => setTheme("light")}>
                  <SunIcon /> Light
                </button>
                <button type="button" class={`ds-segmented-btn${theme() === "dark" ? " active" : ""}`} id="ds-settings-theme-dark" title="Dark theme" onClick={() => setTheme("dark")}>
                  <MoonIcon /> Dark
                </button>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;color:var(--sys-window-text,#333);font-weight:600;">Feed Cover Thumbnails:</div>
                <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">Load and display cover thumbnails in browse feeds.</div>
              </div>
              <button type="button" class={`win-button${coversEnabled() ? " primary" : ""}`} id="ds-settings-covers-toggle" style="font-size:11px;padding:2px 10px;min-width:90px;flex-shrink:0;" onClick={toggleCovers}>
                <Show when={coversEnabled()} fallback={<><Icon name="eye-slash" /> Covers: OFF</>}>
                  <ImageIcon /> Covers: ON
                </Show>
              </button>
            </div>
          </div>
        </div>
        <div class="group-box" id="ds-settings-sec-blacklist">
          <div class="group-box-title"><BlacklistIcon /> Tag Blacklist</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
              Hide or show trigger warnings for releases and chapters matching these tags.
            </div>
            <div style="display:flex;align-items:center;gap:12px;padding:2px 0;background:var(--sys-bg-active,#f8f9fa);border:1px solid var(--sys-border-light,#e2e2e2);border-radius:3px;padding:4px 8px;">
              <span style="font-size:11px;font-weight:600;color:var(--sys-window-text,#333);">Mode:</span>
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">
                <input type="radio" name="ds-bl-mode" value="hide" id="ds-bl-mode-hide" checked={blMode() === "hide"} onChange={() => setMode("hide")} />
                <span>Hide releases</span>
              </label>
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">
                <input type="radio" name="ds-bl-mode" value="warn" id="ds-bl-mode-warn" checked={blMode() === "warn"} onChange={() => setMode("warn")} />
                <span>Trigger warning on click</span>
              </label>
            </div>
            <div style="display:flex;gap:6px;position:relative;">
              <div style="flex:1;">
              <Typeahead
                fetcher={suggest}
                value={blInput()}
                onInputValue={(val) => setBlInput(val)}
                onSelect={(item) => void addTag(item.name, (item as any).permalink)}
                onEnter={(val) => void addTag(val || blInput())}
                placeholder="Search or enter tag to blacklist (e.g. NSFW, Het)..."
                maxItems={6}
                debounceMs={200}
              />
            </div>
              <button type="button" class="win-button" id="ds-settings-blacklist-add" style="font-size:11px;padding:2px 10px;" onClick={() => void addTag(blInput())}>
                <AddIcon /> Add
              </button>
            </div>
            <div id="ds-settings-blacklist-chips" style="display:flex;flex-wrap:wrap;gap:4px;min-height:22px;max-height:120px;overflow-y:auto;padding:2px 0;">
              <Show
                when={blacklist.error}
                fallback={
                  <Show
                    when={blacklist.loading}
                    fallback={
                      <Show
                        when={blacklist() && blacklist()!.length > 0}
                        fallback={<span class="ds-muted" style="font-size:10px;padding:2px 0;">No tags blacklisted.</span>}
                      >
                        <For each={blacklist()!}>
                          {(item: BlacklistedTag) => (
                            <span class="ds-row" style="background:var(--ds-danger-bg);color:var(--ds-danger-text);border:1px solid var(--ds-danger-border);border-radius:3px;padding:1px 6px;font-size:10px;align-items:center;gap:4px;">
                              <span>{item.tag_name}</span>
                              <CloseIcon style={{ cursor: "pointer", "font-size": "13px" }} title="Remove from blacklist" onClick={() => void removeTag(item.tag_name)} />
                            </span>
                          )}
                        </For>
                      </Show>
                    }
                  >
                    <span class="ds-muted" style="font-size:10px;">Loading blacklist…</span>
                  </Show>
                }
              >
                <span class="ds-muted" style="font-size:10px;color:var(--ds-danger-text);padding:2px 0;">Could not load blacklist. Check the application log.</span>
              </Show>
            </div>
          </div>
        </div>
        <div class="group-box" id="ds-settings-sec-reading">
          <div class="group-box-title"><DoublePageIcon /> Reading &amp; Cache</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <div>
                <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">Auto-Cache Entire Chapter</div>
                <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
                  When ON, pre-downloads all pages in a chapter. When OFF, only caches pages as you read them.
                </div>
              </div>
              <button
                type="button"
                class={`win-button${autoCacheEnabled() ? " primary" : ""}`}
                id="ds-settings-autocache-toggle"
                style="font-size:11px;padding:2px 10px;min-width:70px;"
                title={autoCacheEnabled() ? "Pre-downloads full chapters in background (click to cache only as you read)" : "Only caches pages as you read (click to auto-download full chapters)"}
                onClick={() => {
                  setAutoCacheChapterEnabled(!autoCacheEnabled());
                  setAutoCacheEnabled(!autoCacheEnabled());
                }}
              >
                <Show when={autoCacheEnabled()} fallback={<><Icon name="cloud-slash" /> OFF</>}>
                  <CloudDownloadIcon /> ON
                </Show>
              </button>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;">
              <div>
                <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">Page Prefetch Buffer:</div>
                <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
                  Number of upcoming pages to preload ahead when auto-cache is off (default: 0).
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:4px;">
                <button type="button" class="win-button ds-btn-sm" id="ds-settings-prefetch-dec" onClick={() => {
                  const next = Math.max(0, prefetchBuffer() - 1);
                  setPrefetchBuffer(next);
                  setPrefetchBufferLocal(next);
                }}>−</button>
                <span id="ds-settings-prefetch-val" style="font-size:11px;font-weight:600;min-width:54px;text-align:center;">{prefetchBuffer() === 0 ? "0 (off)" : `${prefetchBuffer()} page${prefetchBuffer() === 1 ? "" : "s"}`}</span>
                <button type="button" class="win-button ds-btn-sm" id="ds-settings-prefetch-inc" onClick={() => {
                  const next = Math.min(10, prefetchBuffer() + 1);
                  setPrefetchBuffer(next);
                  setPrefetchBufferLocal(next);
                }}>+</button>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;">
              <div>
                <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">Page Navigation Bar Position:</div>
                <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
                  Dock page navigation &amp; progress at top or bottom (recommended for mobile/narrow screens).
                </div>
              </div>
              <div class="ds-segmented-switch" id="ds-settings-nav-pos-switch" style="flex-shrink:0;">
                <button type="button" class={`ds-segmented-btn${navPosition() === "top" ? " active" : ""}`} id="ds-settings-nav-pos-top" title="Top (default)" onClick={() => {
                  setReaderNavPosition("top");
                  setNavPosition("top");
                }}>
                  <Icon name="align-top" /> Top
                </button>
                <button type="button" class={`ds-segmented-btn${navPosition() === "bottom" ? " active" : ""}`} id="ds-settings-nav-pos-bottom" title="Bottom (mobile / thumb friendly)" onClick={() => {
                  setReaderNavPosition("bottom");
                  setNavPosition("bottom");
                }}>
                  <Icon name="align-bottom" /> Bottom
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="group-box" id="ds-settings-sec-hotkeys">
          <div class="group-box-title"><Icon name="keyboard" /> Keyboard Shortcuts</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 0;">
            <div>
              <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">Custom Hotkeys &amp; Keybindings:</div>
              <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
                View, modify, and assign custom key combinations for reader and navigation actions.
              </div>
            </div>
            <button
              type="button"
              class="win-button"
              id="ds-settings-open-hotkeys"
              style="font-size:11px;padding:2px 10px;flex-shrink:0;"
              onClick={() => setHotkeysOpen(true)}
            >
              <Icon name="keyboard" /> Hotkeys Menu...
            </button>
          </div>
        </div>
        <div class="group-box" id="ds-settings-sec-storage">
          <div class="group-box-title"><StorageIcon /> Storage &amp; Cache</div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;">
            <span style="font-size:12px;color:var(--sys-window-text,#333);">Manage disk footprint &amp; scans:</span>
            <button type="button" class="win-button" id="ds-settings-goto-cache" onClick={() => {
              props.onClose();
              navigate({ view: "cache" });
            }}>
              <ExternalLinkIcon /> Open Cache Manager
            </button>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;margin-top:4px;">
            <span style="font-size:12px;color:var(--sys-window-text,#333);">Series Blacklist:</span>
            <button type="button" class="win-button" id="ds-settings-goto-blacklist" title="Manage blacklisted series" onClick={() => {
              props.onClose();
              navigate({ view: "blacklist" });
            }}>
              <BlacklistIcon /> Open Series Blacklist
            </button>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;margin-top:4px;">
            <span style="font-size:12px;color:var(--sys-window-text,#333);">Troubleshooting:</span>
            <button type="button" class="win-button" id="ds-settings-open-logs" title="Reveal the rolling log file in Explorer" onClick={() => {
              void ipc.openLogsDir().catch((err) => {
                console.error("dynasty-scans-reader: open logs folder failed:", err);
              });
            }}>
              <Icon name="folder2-open" /> Open Logs Folder
            </button>
          </div>
        </div>
        <div class="group-box" id="ds-settings-sec-about">
          <div class="group-box-title"><Icon name="info-circle" /> About DynastyReader</div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <img src="/icon.svg" width="34" height="34" alt="DynastyReader" style="border-radius:4px;flex-shrink:0;user-select:none;pointer-events:none;" />
            <div class="ds-fill">
              <div style="font-size:12px;font-weight:600;color:var(--sys-window-text,#222);display:flex;align-items:center;gap:6px;">
                DynastyReader <span class="ds-etag-tag" style="font-size:10px;font-weight:normal;padding:1px 6px;">v0.1.0</span>
              </div>
              <div class="ds-muted" style="font-size:11px;margin-top:2px;">
                Local-first desktop reader &amp; offline manga catalog for Dynasty Scans.
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
              <button type="button" class="win-button ds-btn-compact" id="ds-about-check-update" title="Check for DynastyReader updates" disabled={checking()} onClick={() => void runCheckUpdates()}>
                <Show when={checking()} fallback={<><RefreshIcon /> Check Updates</>}>
                  <RefreshIcon spin={true} /> Checking...
                </Show>
              </button>
              <button type="button" class="win-button ds-btn-compact" id="ds-about-open-github" title="Open DynastyReader GitHub repository" onClick={() => void openExternal("https://github.com/FuouM/DynastyReader")}>
                <Icon name="github" /> GitHub
              </button>
              <ExternalLinkButton
                id="ds-about-open-site"
                title="Open Dynasty Scans website in browser"
                url="https://dynasty-scans.com"
              >
                dynasty-scans.com
              </ExternalLinkButton>
            </div>
          </div>
        </div>
        </div>
      </div>
      <HotkeysModal open={hotkeysOpen()} onClose={() => setHotkeysOpen(false)} />
    </Modal>
  );
}