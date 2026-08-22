import { Show } from "solid-js";
import { isMobile, navigate, route } from "../stores";
import { Icon, StorageIcon } from "./Icon";

export function BottomNav() {
  return (
    <Show when={isMobile()}>
      <nav id="ds-bottom-nav">
        <button
          type="button"
          class="ds-bn-tab"
          classList={{ active: route().view === "browse" }}
          onClick={() => navigate({ view: "browse" })}
        >
          <Icon name="compass" />
          <span>Browse</span>
        </button>
        <button
          type="button"
          class="ds-bn-tab"
          classList={{ active: route().view === "library" }}
          onClick={() => navigate({ view: "library" })}
        >
          <StorageIcon />
          <span>Library</span>
        </button>
      </nav>
    </Show>
  );
}
