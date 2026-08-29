/**
 * Solid Series Blacklist view. Port of `ui-blacklist.ts`:
 *  - blacklist behavior mode switch (hide / trigger warning)
 *  - blacklisted series list with navigate / open-external / remove
 */

import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { navigate, setActions, showBanner } from "../stores";
import { decodeEntities, safeHtml } from "../utils/html";
import { formatDate, dynastyUrl } from "../utils/formatting";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
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
import { BlacklistModeSwitch } from "../components/BlacklistModeSwitch";
import { GroupBox } from "../components/GroupBox";
export function BlacklistView() {
  const [data, { refetch }] = createResource<BlacklistedSeries[]>(() =>
    getBlacklistedSeries(),
  );
  const showSpinner = useDelayedSpinner(() => data.loading);
  const [mode, setMode] = createSignal<BlacklistMode>(getBlacklistMode());

  const changeMode = (next: BlacklistMode): void => {
    setMode(next);
    setBlacklistMode(next);
    const modeLabel = next === "hide" ? t("blacklist.modeChangedHide") : next === "ghost" ? t("blacklist.modeChangedGhost") : t("blacklist.modeChangedWarn");
    showBanner(
      t("blacklist.modeChangedBanner", {
        mode: modeLabel,
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

  const errorText = (): string => errorMessage(data.error);

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
                <span class="ds-muted">{t("blacklist.loadError", { msg: errorText() })}</span>
                <Button icon={<RefreshIcon />} text={t("common.retry")} onClick={() => void refetch()} />
              </div>
            </Show>
          </>
        }
      >
        <GroupBox
          title={<IconText icon={<BlacklistIcon filled={false} />}>{t("blacklist.title")}</IconText>}
        >
          <div class="ds-stack-8">
            <div class="ds-muted">
              {t("blacklist.description")}
            </div>
            <BlacklistModeSwitch
              id="ds-bl-mode-switch-view"
              value={mode}
              onChange={changeMode}
            />
          </div>
        </GroupBox>

        <GroupBox
          title={<IconText icon={<ListCheckIcon />}>{t("blacklist.seriesTitle", { count: data()!.length })}</IconText>}
        >

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
                        url={dynastyUrl("series", item.series_permalink)}
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
        </GroupBox>
      </Show>
    </div>
  );
}
