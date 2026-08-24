/**
 * Solid Series Blacklist view. Port of `ui-blacklist.ts`:
 *  - blacklist behavior mode switch (hide / trigger warning)
 *  - blacklisted series list with navigate / open-external / remove
 */

import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { decodeEntities, formatDate, navigate, safeHtml, setActions, showBanner, SITE_ROOT } from "../stores";
import { t } from "../i18n";
import {
  getBlacklistMode,
  getBlacklistedSeries,
  removeBlacklistedSeries,
  setBlacklistMode,
  type BlacklistedSeries,
  type BlacklistMode,
} from "../db";
import { useDelayedSpinner } from "../browse/browse-state";
import { BackRefreshActions } from "../components/ActionBar";
import { ExternalLinkButton } from "../components/ExternalLinkButton";
import {
  RefreshIcon,
  BlacklistIcon,
  ListCheckIcon,
  TrashIcon,
} from "../components/Icon";
import { Loading } from "../components/Loading";
import { Button, IconText } from "../components/Button";

export function BlacklistView() {
  const [data, { refetch }] = createResource<BlacklistedSeries[]>(() =>
    getBlacklistedSeries(),
  );
  const showSpinner = useDelayedSpinner(() => data.loading);
  const [mode, setMode] = createSignal<BlacklistMode>(getBlacklistMode());

  const changeMode = (next: BlacklistMode): void => {
    setMode(next);
    setBlacklistMode(next);
    showBanner(
      t("blacklist.modeChangedBanner", {
        mode: next === "hide" ? t("blacklist.modeChangedHide") : t("blacklist.modeChangedWarn"),
      }),
    );
  };

  const removeSeries = async (item: BlacklistedSeries): Promise<void> => {
    await removeBlacklistedSeries(item.series_permalink);
    showBanner(t("blacklist.removedSeriesBanner", { name: item.series_name }));
    void refetch();
  };

  // Publish the Back + Refresh top-bar actions once data is ready.
  createEffect(() => {
    if (data() === undefined) return;
    setActions(
      <BackRefreshActions
        backLabel={t("blacklist.backToLibrary")}
        onBack={() => navigate({ view: "library" })}
        onRefresh={() => void refetch()}
      />,
    );
  });

  const errorMessage = (): string => {
    const e = data.error;
    if (e instanceof Error) return e.message;
    return String(e);
  };

  return (
    <div
      id="ds-blacklist-view-container"
      style="display:flex;flex-direction:column;gap:12px;padding:8px 4px;width:100%;box-sizing:border-box;"
    >
      <Show
        when={data() !== undefined}
        fallback={
          <>
            <Show when={showSpinner()}>
              <Loading />
            </Show>
            <Show when={data.error !== undefined && data() === undefined}>
              <div class="ds-row" style="padding:12px;gap:8px;align-items:center;">
                <span class="ds-muted">{t("blacklist.loadError", { msg: errorMessage() })}</span>
                <Button icon={<RefreshIcon />} text={t("common.retry")} onClick={() => void refetch()} />
              </div>
            </Show>
          </>
        }
      >
        <div class="group-box">
          <div class="group-box-title">
            <IconText icon={<BlacklistIcon filled={false} />}>{t("blacklist.title")}</IconText>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);line-height:1.4;">
              {t("blacklist.description")}
            </div>
            <div
              style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;background:var(--sys-control-bg,#f8f8f8);border:1px solid var(--sys-border-light,#e0e0e0);border-radius:3px;flex-wrap:wrap;"
            >
              <div style="font-size:11px;font-weight:600;color:var(--sys-window-text,#333);">
                {t("blacklist.modeHeader")}:
              </div>
              <div class="ds-radio-group" style="display:flex;gap:12px;">
                <label style="font-size:11px;cursor:pointer;">
                  <input
                    type="radio"
                    name="ds-bl-mode"
                    value="hide"
                    checked={mode() === "hide"}
                    onChange={() => changeMode("hide")}
                  />{" "}
                  {t("blacklist.modeHide")}
                </label>
                <label style="font-size:11px;cursor:pointer;">
                  <input
                    type="radio"
                    name="ds-bl-mode"
                    value="warn"
                    checked={mode() === "warn"}
                    onChange={() => changeMode("warn")}
                  />{" "}
                  {t("blacklist.modeWarn")}
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="group-box">
          <div class="group-box-title" style="display:flex;justify-content:space-between;align-items:center;">
            <IconText icon={<ListCheckIcon />}>{t("blacklist.seriesTitle", { count: data()!.length })}</IconText>
          </div>

          <Show
            when={data()!.length > 0}
            fallback={
              <div class="ds-muted" style="padding:20px 8px;text-align:center;font-size:11px;">
                <BlacklistIcon
                  filled={false}
                  style={{
                    "font-size": "26px",
                    display: "block",
                    "margin-bottom": "8px",
                    color: "var(--sys-primary,#0078d4)",
                  }}
                />
                {t("blacklist.emptySeriesTitle")}
                <br />
                <span
                  style="color:var(--sys-text-muted,#666);display:inline-block;margin-top:4px;"
                >
                  {t("blacklist.emptySeriesHint")}
                </span>
              </div>
            }
          >
            <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;">
              <For each={data()!}>
                {(item) => (
                  <div
                    class="ds-item"
                    style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;gap:8px;border-radius:2px;"
                  >
                    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
                      <BlacklistIcon
                        filled={true}
                        style={{
                          color: "var(--ds-warn-text,#d97706)",
                          "font-size": "13px",
                          "flex-shrink": "0",
                        }}
                      />
                      <div style="display:flex;flex-direction:column;min-width:0;flex:1;">
                        <div
                          class="ds-item-title ds-clickable ds-truncate"
                          style="font-weight:600;font-size:12px;"
                          onClick={() =>
                            navigate({
                              view: "series",
                              seriesPermalink: item.series_permalink,
                              seriesName: item.series_name,
                            })
                          }
                        >
                          {decodeEntities(item.series_name)}
                        </div>
                        <div class="ds-muted" style="font-size:10px;display:flex;align-items:center;gap:6px;margin-top:1px;">
                          <span class="ds-etag-tag" style="font-size:9px;padding:0 4px;">
                            {safeHtml(item.series_permalink)}
                          </span>
                          <span>{t("blacklist.blacklistedOn", { date: formatDate(item.created_at) })}</span>
                        </div>
                      </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                      <ExternalLinkButton
                        className="ds-btn-icon"
                        title={t("blacklist.openOnDynastyTooltip")}
                        url={`${SITE_ROOT}/series/${item.series_permalink}`}
                      />
                      <Button
                        icon={<TrashIcon />}
                        text={t("common.remove")}
                        className="ds-btn-sm"
                        title={t("blacklist.removeSeriesTooltip")}
                        onClick={() => void removeSeries(item)}
                      />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}