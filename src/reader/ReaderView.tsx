/**
 * Reader view entry: mounts the reactive Solid reader island.
 */

import { onCleanup, onMount, Show } from "solid-js";
import type { Route } from "../types/routes";
import { createReaderSession } from "./reader-session";
import { ReaderToolbar, ReaderBottomNav } from "./ReaderToolbar";
import { ReaderViewport } from "./ReaderViewport";
import { ReaderStrip } from "./ReaderStrip";
import { ReaderShortcuts } from "./ReaderShortcuts";
import { ReaderWheel } from "./ReaderWheel";
import { Loading } from "../components/Loading";
import { IconButton } from "../components/Button";
import { RefreshIcon } from "../components/Icon";
import { theme } from "../stores/theme";
import { t } from "../i18n";

export function ReaderView(props: { route: Route }) {
  // Keyed on permalink so a new chapter always gets a fresh session
  return (
    <Show when={props.route.chapterPermalink} keyed>
      {(permalink) => <ReaderViewInner permalink={permalink} route={props.route} />}
    </Show>
  );
}

function ReaderViewInner(props: { permalink: string; route: Route }) {
  const session = createReaderSession(props.route);

  onMount(() => {
    void session.init();
  });
  onCleanup(() => session.dispose());
  return (
    <div class="ds-reader-view">
      <Show when={session.loading()}>
        <Loading />
      </Show>
      <Show when={session.error()}>
        {(msg) => (
          <div class="ds-reader-empty">
            <div class="ds-reader-error">{msg()}</div>
            <IconButton
              icon={<RefreshIcon />}
              text={t("reader.session.retry")}
              onClick={() => session.retry()}
            />
          </div>
        )}
      </Show>
      <Show when={session.empty()}>
        <div class="ds-muted ds-reader-empty">
          {t("reader.session.empty")}
        </div>
      </Show>
      <Show when={!session.loading() && !session.error() && !session.empty()}>
        <div
          ref={(el) => {
            session.containerEl = el;
          }}
          id="ds-reader-container"
          class={`fit-${session.fitMode()}`}
          style={{ "--ds-zoom-scale": session.zoomScale() }}
          classList={{
            "ds-fullscreen": session.isFullscreen(),
            "ds-dark": theme() !== "light",
            "ds-restoring": session.restoring(),
            "ds-hud-visible": session.toolbarVisible(),
            "is-scroll-locked": session.scrollLock(),
            "is-long-strip": session.isLongStrip(),
          }}
        >
          <ReaderToolbar session={session} />
          <ReaderViewport session={session}>
            <ReaderStrip session={session} />
          </ReaderViewport>
          <ReaderBottomNav session={session} />
        </div>
        <ReaderShortcuts session={session} />
        <ReaderWheel session={session} />
      </Show>
    </div>
  );
}