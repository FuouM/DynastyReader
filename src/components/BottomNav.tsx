import { Show } from "solid-js";
import { isMobile, navigate, route, sessionTab, isInMangaView } from "../stores";
import { t } from "../i18n";
import { Icon, StorageIcon, DoublePageIcon } from "./Icon";

export function BottomNav() {
  return (
    <Show when={isMobile() && route().view !== "reader"}>
      <nav id="ds-bottom-nav">
        <button
          type="button"
          class="ds-bn-tab"
          classList={{ active: route().view === "browse" }}
          onClick={() => navigate({ view: "browse" })}
        >
          <Icon name="compass" />
          <span>{t("bottomNav.browse")}</span>
        </button>
        <button
          type="button"
          class="ds-bn-tab"
          classList={{ active: route().view === "library" }}
          onClick={() => navigate({ view: "library" })}
        >
          <StorageIcon />
          <span>{t("bottomNav.library")}</span>
        </button>
        <Show when={sessionTab() !== null}>
          <button
            type="button"
            class="ds-bn-tab ds-bn-manga-tab"
            classList={{ active: isInMangaView() }}
            onClick={() => {
              const tab = sessionTab();
              if (tab) navigate(tab.route);
            }}
          >
            <DoublePageIcon />
            <span>{t("bottomNav.reading")}</span>
          </button>
        </Show>
      </nav>
    </Show>
  );
}
