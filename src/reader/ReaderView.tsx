/**
 * Reader view entry: mounts the authoritative ReaderController inside a clean
 * container, matching 100% of the pre-port reader behavior verbatim.
 */

import { createEffect, onCleanup } from "solid-js";
import type { Route } from "../types/routes";
import { renderReader } from "./reader-controller";

export function ReaderView(props: { route: Route }) {
  let container: HTMLDivElement | undefined;
  let currentCleanup: (() => void) | void;

  createEffect(() => {
    const permalink = props.route.chapterPermalink;
    if (currentCleanup) {
      currentCleanup();
      currentCleanup = undefined;
    }
    if (container && permalink) {
      currentCleanup = renderReader(container, props.route);
    }
  });

  onCleanup(() => {
    if (currentCleanup) {
      currentCleanup();
      currentCleanup = undefined;
    }
  });

  return (
    <div
      ref={container}
      style="width:100%;height:100%;display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;"
    />
  );
}