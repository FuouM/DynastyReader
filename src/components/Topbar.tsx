/**
 * Solid top bar for the dynasty-scans plugin. Port of the imperative shell
 * builder in `src/index.ts:48-83` plus the banner/session-tab DOM writes from
 * `src/topbar.ts` and `src/router.ts`. All ids/classes are reproduced verbatim
 * so the WinForms design system CSS applies unchanged.
 */

import { createEffect, createSignal, onMount, Show } from "solid-js";
import {
  route,
  navigate,
  goBack,
  goForward,
  canGoBack,
  canGoForward,
  closeSessionMangaTab,
  isInMangaView,
  sessionTab,
  title,
  banner,
  actions,
} from "../stores";
import { decodeEntities } from "../stores";
import { SettingsModal } from "./SettingsModal";

export function Topbar() {
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  let topbarEl: HTMLDivElement | undefined;

  onMount(() => {
    if (!topbarEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width < 780) {
          topbarEl.classList.add("ds-narrow");
        } else {
          topbarEl.classList.remove("ds-narrow");
        }
      }
    });
    ro.observe(topbarEl);
    return () => ro.disconnect();
  });

  return (
    <>
      <div id="ds-topbar" ref={topbarEl}>
        <div id="ds-topbar-main">
          <div class="ds-flex-row" id="ds-nav-tabs">
            <div class="ds-segmented-switch" id="ds-view-switch">
              <button
                type="button"
                class="ds-segmented-btn"
                id="ds-tab-browse"
                classList={{ active: route().view === "browse" }}
                title="Browse &amp; Recent"
                onClick={() => navigate({ view: "browse" })}
              >
                <i class="bi bi-compass"></i> <span class="ds-tab-text-full">Browse &amp; Recent</span>
                <span class="ds-tab-text-short">Browse</span>
              </button>
              <button
                type="button"
                class="ds-segmented-btn"
                id="ds-tab-library"
                classList={{ active: route().view === "library" }}
                title="Library"
                onClick={() => navigate({ view: "library" })}
              >
                <i class="bi bi-collection"></i> <span class="ds-tab-text-full">Library</span>
                <span class="ds-tab-text-short">Library</span>
              </button>
            </div>
            <div class="ds-segmented-switch ds-nav-history-switch" id="ds-nav-history">
              <button
                type="button"
                class="ds-segmented-btn ds-nav-history-btn"
                id="ds-nav-back"
                title="Back"
                disabled={!canGoBack()}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => goBack()}
              >
                <i class="bi bi-arrow-left"></i>
              </button>
              <button
                type="button"
                class="ds-segmented-btn ds-nav-history-btn"
                id="ds-nav-forward"
                title="Forward"
                disabled={!canGoForward()}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => goForward()}
              >
                <i class="bi bi-arrow-right"></i>
              </button>
            </div>
            <Show when={sessionTab() !== null}>
              <div id="ds-session-tab-wrap" style="display:inline-flex;margin-left:2px;">
                <button
                  type="button"
                  class="win-button ds-nav-tab ds-session-tab"
                  classList={{ active: isInMangaView() }}
                  style="display:inline-flex;align-items:center;gap:6px;max-width:220px;padding:2px 8px;font-size:11px;"
                  onClick={() => {
                    const tab = sessionTab();
                    if (tab) navigate(tab.route);
                  }}
                >
                  <i class="bi bi-book-half"></i>
                  <span class="ds-truncate">{decodeEntities(sessionTab()!.title)}</span>
                  <i
                    class="bi bi-x"
                    title="Close tab"
                    style="cursor:pointer;font-size:13px;opacity:0.75;padding:0 2px;"
                    onMouseOver={(ev) => (ev.currentTarget.style.opacity = "1")}
                    onMouseOut={(ev) => (ev.currentTarget.style.opacity = "0.75")}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      closeSessionMangaTab();
                    }}
                  ></i>
                </button>
              </div>
            </Show>
          </div>
          <span id="ds-title" style="margin-left:8px;">
            {title()}
          </span>
          <Show when={banner() !== null}>
            <div id="ds-banner">{banner()}</div>
          </Show>
          <div
            id="ds-actions"
            ref={(el) => {
              createEffect(() => {
                const act = actions();
                if (typeof act === "function") {
                  el.innerHTML = "";
                  act(el);
                } else if (act === null) {
                  el.innerHTML = "";
                }
              });
            }}
          >
            {typeof actions() !== "function" ? (actions() as any) : null}
          </div>
          <div id="ds-topbar-tools">
            <button
              type="button"
              class="win-button ds-btn-sm"
              id="ds-page-refresh-btn"
              title="Refresh Page"
              onClick={() => window.location.reload()}
            >
              <i class="bi bi-arrow-clockwise"></i>
            </button>
            <button
              type="button"
              class="win-button ds-btn-sm"
              id="ds-settings-btn"
              title="Settings (UI Scale &amp; Preferences)"
              onClick={() => setSettingsOpen(true)}
            >
              <i class="bi bi-gear-fill"></i>
            </button>
          </div>
        </div>
      </div>
      <SettingsModal open={settingsOpen()} onClose={() => setSettingsOpen(false)} />
    </>
  );
}