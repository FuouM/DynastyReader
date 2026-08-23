import { Show } from "solid-js";
import { isMobile, navigate, route, sessionTab, isInMangaView } from "../stores";
import { t } from "../i18n";
import { Icon, StorageIcon, DoublePageIcon } from "./Icon";
import { IconButton } from "./Button";

export function BottomNav() {
  return (
    <Show when={isMobile() && route().view !== "reader"}>
      <nav id="ds-bottom-nav">
        <IconButton
          icon={<Icon name="compass" />}
          text={t("bottomNav.browse")}
          className="ds-bn-tab"
          classList={{ active: route().view === "browse" }}
          onClick={() => navigate({ view: "browse" })}
        />
        <IconButton
          icon={<StorageIcon />}
          text={t("bottomNav.library")}
          className="ds-bn-tab"
          classList={{ active: route().view === "library" }}
          onClick={() => navigate({ view: "library" })}
        />
        <Show when={sessionTab() !== null}>
          <IconButton
            icon={<DoublePageIcon />}
            text={t("bottomNav.reading")}
            className="ds-bn-tab ds-bn-manga-tab"
            classList={{ active: isInMangaView() }}
            onClick={() => {
              const tab = sessionTab();
              if (tab) navigate(tab.route);
            }}
          />
        </Show>
      </nav>
    </Show>
  );
}
