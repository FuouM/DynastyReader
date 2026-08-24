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
import { theme } from "../stores";
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
    <div style="width:100%;height:100%;display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;">
      <Show when={session.loading()}>
        <Loading />
      </Show>
      <Show when={session.error()}>
        {(msg) => (
          <div style="padding:24px;text-align:center;">
            <div style="color:var(--sys-error,#d13438);margin-bottom:12px;">{msg()}</div>
            <IconButton
              icon={<RefreshIcon />}
              text={t("reader.session.retry")}
              onClick={() => session.retry()}
            />
          </div>
        )}
      </Show>
      <Show when={session.empty()}>
        <div class="ds-muted" style="padding:24px;text-align:center;">
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
          classList={{
            "ds-fullscreen": session.isFullscreen(),
            "ds-dark": theme() === "dark",
            "ds-restoring": session.restoring(),
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