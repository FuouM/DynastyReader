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
      class="ds-bl-view"
    >
      <Show
        when={data() !== undefined}
        fallback={
          <>
            <Show when={showSpinner()}>
              <Loading />
            </Show>
            <Show when={data.error !== undefined && data() === undefined}>
              <div class="ds-row ds-bl-error-row">
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
            <div class="ds-muted">
              {t("blacklist.description")}
            </div>
            <div class="ds-bl-mode-bar">
              <div class="ds-bl-mode-label">
                {t("blacklist.modeHeader")}:
              </div>
              <div class="ds-radio-group ds-bl-mode-options">
                <label class="ds-bl-mode-option">
                  <input
                    type="radio"
                    name="ds-bl-mode"
                    value="hide"
                    checked={mode() === "hide"}
                    onChange={() => changeMode("hide")}
                  />{" "}
                  {t("blacklist.modeHide")}
                </label>
                <label class="ds-bl-mode-option">
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
          <div class="group-box-title" style="justify-content:space-between;">
            <IconText icon={<ListCheckIcon />}>{t("blacklist.seriesTitle", { count: data()!.length })}</IconText>
          </div>

          <Show
            when={data()!.length > 0}
            fallback={
              <div class="ds-bl-empty">
                <BlacklistIcon
                  filled={false}
                  class="ds-bl-empty-icon"
                />
                {t("blacklist.emptySeriesTitle")}
                <br />
                <span class="ds-muted">
                  {t("blacklist.emptySeriesHint")}
                </span>
              </div>
            }
          >
            <div class="ds-bl-series-list">
              <For each={data()!}>
                {(item) => (
                  <div class="ds-bl-series-item">
                    <div class="ds-bl-series-info">
                      <BlacklistIcon
                        filled={true}
                        class="ds-bl-series-icon"
                      />
                      <div class="ds-bl-series-details">
                        <div
                          class="ds-item-title ds-clickable ds-truncate"
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
                        <div class="ds-muted ds-bl-series-meta">
                          <span class="ds-etag-tag">{safeHtml(item.series_permalink)}</span>
                          <span>{t("blacklist.blacklistedOn", { date: formatDate(item.created_at) })}</span>
                        </div>
                      </div>
                    </div>
                    <div class="ds-bl-series-actions">
                      <ExternalLinkButton
                        className="ds-btn-icon"
                        title={t("blacklist.openOnDynastyTooltip")}
                        url={`${SITE_ROOT}/series/${item.series_permalink}`}
                      />
                      <Button
                        icon={<TrashIcon />}
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
