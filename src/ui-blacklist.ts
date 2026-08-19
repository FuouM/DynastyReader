/**
 * Series Blacklist Management View: View for inspecting and removing
 * blacklisted series, configuring warning modes, and navigating to series entries.
 * (Series are blacklisted directly from each series' page).
 */

import {
  Route,
  decodeEntities,
  formatDate,
  navigate,
  safeHtml,
  setActions,
  setBanner,
} from "./state";
import {
  getBlacklistedSeries,
  removeBlacklistedSeries,
  getBlacklistMode,
  setBlacklistMode,
} from "./db";
import { openExternal } from "./api";
import { renderLoading } from "./components/loading";
import { createBackRefreshActions } from "./components/action-bar";

export function renderBlacklist(container: HTMLElement, _route: Route): void {
  container.innerHTML = "";

  const root = document.createElement("div");
  root.id = "ds-blacklist-view-container";
  root.style.cssText =
    "display:flex;flex-direction:column;gap:12px;padding:8px 4px;width:100%;box-sizing:border-box;";
  container.appendChild(root);

  const loadView = async (): Promise<void> => {
    root.innerHTML = "";
    root.appendChild(renderLoading());

    try {
      const seriesList = await getBlacklistedSeries();
      root.innerHTML = "";

      // Setup Top Bar Actions
      setActions((host) => {
        for (const btn of createBackRefreshActions(
          "Back to Library",
          () => navigate({ view: "library" }),
          () => void loadView(),
        )) {
          host.appendChild(btn);
        }
      });

      // 1. Overview & Mode Group Box
      const overviewBox = document.createElement("div");
      overviewBox.className = "group-box";
      const overviewHead = document.createElement("div");
      overviewHead.className = "group-box-title";
      overviewHead.innerHTML = '<i class="bi bi-shield-slash"></i> Series Blacklist Preferences';
      overviewBox.appendChild(overviewHead);

      const overviewBody = document.createElement("div");
      overviewBody.style.cssText = "display:flex;flex-direction:column;gap:8px;";

      const descLine = document.createElement("div");
      descLine.className = "ds-muted";
      descLine.style.cssText = "font-size:11px;color:var(--sys-text-muted,#666);line-height:1.4;";
      descLine.innerHTML =
        "Blacklisted series will have all their releases and chapters completely hidden from browse feeds and search results (or trigger a content warning dialog before opening if Trigger warning mode is active). To blacklist a series, visit the series' page and click the <b>Blacklist</b> button in the top action bar.";
      overviewBody.appendChild(descLine);

      // Mode switch
      const modeRow = document.createElement("div");
      modeRow.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;background:var(--sys-control-bg,#f8f8f8);border:1px solid var(--sys-border-light,#e0e0e0);border-radius:3px;flex-wrap:wrap;";

      const modeLabel = document.createElement("div");
      modeLabel.style.cssText = "font-size:11px;font-weight:600;color:var(--sys-window-text,#333);";
      modeLabel.textContent = "Blacklist Behavior:";

      const modeControls = document.createElement("div");
      modeControls.style.cssText = "display:flex;align-items:center;gap:12px;";

      const curMode = getBlacklistMode();
      modeControls.innerHTML = `
        <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">
          <input type="radio" name="ds-bl-view-mode" value="hide" ${curMode === "hide" ? "checked" : ""} />
          <span>Hide releases</span>
        </label>
        <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">
          <input type="radio" name="ds-bl-view-mode" value="warn" ${curMode === "warn" ? "checked" : ""} />
          <span>Trigger warning on click</span>
        </label>
      `;
      modeControls.querySelectorAll<HTMLInputElement>("input[type=radio]").forEach((radio) => {
        radio.addEventListener("change", () => {
          setBlacklistMode(radio.value as "hide" | "warn");
          setBanner(`Blacklist mode set to: ${radio.value === "hide" ? "Hide releases" : "Trigger warning on click"}`);
        });
      });

      modeRow.appendChild(modeLabel);
      modeRow.appendChild(modeControls);
      overviewBody.appendChild(modeRow);

      overviewBox.appendChild(overviewBody);
      root.appendChild(overviewBox);

      // 2. Blacklisted Series List Box
      const listBox = document.createElement("div");
      listBox.className = "group-box";

      const listHead = document.createElement("div");
      listHead.className = "group-box-title";
      listHead.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
      listHead.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;">
          <i class="bi bi-list-check"></i> Blacklisted Series (${seriesList.length})
        </div>
      `;

      listBox.appendChild(listHead);

      if (seriesList.length === 0) {
        const empty = document.createElement("div");
        empty.className = "ds-muted";
        empty.style.cssText = "padding:20px 8px;text-align:center;font-size:11px;";
        empty.innerHTML =
          '<i class="bi bi-shield-check" style="font-size:26px;display:block;margin-bottom:8px;color:var(--sys-primary,#0078d4);"></i>No series currently blacklisted.<br><span style="color:var(--sys-text-muted,#666);display:inline-block;margin-top:4px;">To blacklist a series, visit its page from Browse or Search and click the <b>Blacklist</b> button.</span>';
        listBox.appendChild(empty);
      } else {
        const listWrap = document.createElement("div");
        listWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-top:4px;";

        for (const item of seriesList) {
          const row = document.createElement("div");
          row.className = "ds-item";
          row.style.cssText =
            "display:flex;align-items:center;justify-content:space-between;padding:6px 8px;gap:8px;border-radius:2px;";

          const left = document.createElement("div");
          left.style.cssText = "display:flex;align-items:center;gap:8px;flex:1;min-width:0;";

          const icon = document.createElement("i");
          icon.className = "bi bi-shield-slash-fill";
          icon.style.cssText = "color:var(--ds-warn-text,#d97706);font-size:13px;flex-shrink:0;";
          left.appendChild(icon);

          const titleWrap = document.createElement("div");
          titleWrap.style.cssText = "display:flex;flex-direction:column;min-width:0;flex:1;";

          const title = document.createElement("div");
          title.className = "ds-item-title ds-clickable ds-truncate";
          title.style.cssText = "font-weight:600;font-size:12px;";
          title.textContent = decodeEntities(item.series_name);
          title.addEventListener("click", () => {
            navigate({
              view: "series",
              seriesPermalink: item.series_permalink,
              seriesName: item.series_name,
            });
          });
          titleWrap.appendChild(title);

          const meta = document.createElement("div");
          meta.className = "ds-muted";
          meta.style.cssText = "font-size:10px;display:flex;align-items:center;gap:6px;margin-top:1px;";
          meta.innerHTML = `
            <span class="ds-etag-tag" style="font-size:9px;padding:0 4px;">${safeHtml(item.series_permalink)}</span>
            <span>Blacklisted on ${formatDate(item.created_at)}</span>
          `;
          titleWrap.appendChild(meta);

          left.appendChild(titleWrap);
          row.appendChild(left);

          const right = document.createElement("div");
          right.style.cssText = "display:flex;align-items:center;gap:4px;flex-shrink:0;";

          const openBtn = document.createElement("button");
          openBtn.type = "button";
          openBtn.className = "win-button ds-btn-xs";
          openBtn.title = "Open on dynasty-scans.com";
          openBtn.innerHTML = '<i class="bi bi-box-arrow-up-right"></i>';
          openBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            void openExternal(`https://dynasty-scans.com/series/${item.series_permalink}`);
          });
          right.appendChild(openBtn);

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "win-button ds-btn-xs";
          removeBtn.title = "Remove series from blacklist";
          removeBtn.innerHTML = '<i class="bi bi-trash"></i> Remove';
          removeBtn.addEventListener("click", async () => {
            await removeBlacklistedSeries(item.series_permalink);
            setBanner(`Removed "${item.series_name}" from blacklist.`);
            void loadView();
          });
          right.appendChild(removeBtn);

          row.appendChild(right);
          listWrap.appendChild(row);
        }

        listBox.appendChild(listWrap);
      }

      root.appendChild(listBox);
    } catch (err) {
      root.innerHTML = "";
      const msg = err instanceof Error ? err.message : String(err);
      setBanner(`Failed to load series blacklist: ${msg}`);
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "win-button";
      retry.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Retry';
      retry.addEventListener("click", () => void loadView());
      root.appendChild(retry);
    }
  };

  void loadView();
}
