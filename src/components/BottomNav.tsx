import { Show } from "solid-js";
import { isMobile } from "../stores/platform";
import { navigate, route, sessionTab, isInMangaView } from "../stores/router";
import { t } from "../i18n";
import { Icon, StorageIcon, DoublePageIcon } from "./Icon";

export function BottomNav() {
  return (
    <Show when={isMobile() && route().view !== "reader"}>
      <nav id="ds-bottom-nav" aria-label={t("bottomNav.ariaLabel")}>
        <button
          type="button"
          class="win-button ds-bn-tab"
          classList={{ active: route().view === "browse" }}
          onClick={() => navigate({ view: "browse" })}
          aria-current={route().view === "browse" ? "page" : undefined}
        >
          <span class="ds-btn-icon-wrap"><Icon name="compass" /></span>
          <span class="ds-btn-text">{t("bottomNav.browse")}</span>
        </button>
        <button
          type="button"
          class="win-button ds-bn-tab"
          classList={{ active: route().view === "library" }}
          onClick={() => navigate({ view: "library" })}
          aria-current={route().view === "library" ? "page" : undefined}
        >
          <span class="ds-btn-icon-wrap"><StorageIcon /></span>
          <span class="ds-btn-text">{t("bottomNav.library")}</span>
        </button>
        <Show when={sessionTab() !== null}>
          <button
            type="button"
            class="win-button ds-bn-tab ds-bn-manga-tab"
            classList={{ active: isInMangaView() }}
            onClick={() => {
              const tab = sessionTab();
              if (tab) navigate(tab.route);
            }}
            aria-current={isInMangaView() ? "page" : undefined}
          >
            <span class="ds-btn-icon-wrap"><DoublePageIcon /></span>
            <span class="ds-btn-text">{t("bottomNav.reading")}</span>
          </button>
        </Show>
      </nav>
    </Show>
  );
}
