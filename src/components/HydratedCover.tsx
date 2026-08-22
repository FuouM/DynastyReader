/**
 * Hydrated cover thumbnail for feed/cache rows. Consolidates the hand-rolled
 * hydrated cover in FeedItemRow and CacheView's inline placeholder+FeedCover
 * pair.
 *
 * - No local `path` → lazy-hydrates via `browseCovers.observe` using the
 *   `data-feed-cover`/`data-chapter-permalink`/`data-series-permalink`/
 *   `data-series-type` dataset contract; the engine swaps in the `<img>`.
 * - Local `path` → renders the `<img>` directly with an error → placeholder
 *   fallback.
 * - `size` maps to the 42×58 feed or 36×50 cache dimensions.
 */

import { createEffect, createSignal, on, Show } from "solid-js";
import { convertFileSrc } from "../ipc";
import { browseCovers } from "../browse/browse-covers";
import { BookIcon } from "./Icon";

export interface HydratedCoverProps {
  /** Local file path; when absent the cover is lazy-hydrated instead. */
  path?: string | null;
  /** Hydration key (`data-feed-cover`) and `<img alt>`. */
  coverKey: string;
  /** Dataset metadata consumed by `browseCovers` for hydration. */
  chapterPermalink?: string;
  seriesPermalink?: string;
  seriesType?: string;
  /** Wrap `title` tooltip. */
  title?: string;
  /** Sizing preset: `feed` = 42×58, `cache` = 36×50. */
  size?: "feed" | "cache";
  onClick?: (ev: MouseEvent) => void;
  /** Extra inline styles appended to the cover wrap. */
  cssText?: string;
}

const SIZES = {
  feed: {
    wrap: "flex-shrink:0;cursor:pointer;",
    img: "",
    placeholder: "",
  },
  cache: {
    wrap: "width:36px;height:50px;cursor:pointer;flex-shrink:0;",
    img: "width:36px;height:50px;",
    placeholder: "width:36px;height:50px;font-size:12px;",
  },
} as const;

export function HydratedCover(props: HydratedCoverProps) {
  const [error, setError] = createSignal(false);
  const hydrated = (): boolean => !props.path;

  createEffect(
    on(
      () => props.path,
      () => setError(false),
      { defer: true },
    ),
  );

  const size = () => SIZES[props.size ?? "feed"];
  const isCache = () => props.size === "cache";

  return (
    <div
      ref={(el) => {
        if (hydrated()) browseCovers.observe(el);
      }}
      class="ds-feed-cover-wrap"
      style={`${size().wrap}${props.cssText ?? ""}`}
      data-feed-cover={hydrated() ? props.coverKey : undefined}
      data-chapter-permalink={hydrated() ? props.chapterPermalink : undefined}
      data-series-permalink={hydrated() ? props.seriesPermalink : undefined}
      data-series-type={hydrated() ? props.seriesType : undefined}
      title={props.title}
      onClick={props.onClick}
    >
      <Show
        when={!hydrated() && !error()}
        fallback={
          <div class="ds-feed-cover-placeholder" style={size().placeholder}>
            <BookIcon />
          </div>
        }
      >
        <img
          class="ds-feed-cover"
          style={size().img}
          alt={props.coverKey}
          width={isCache() ? 36 : 42}
          height={isCache() ? 50 : 58}
          decoding="async"
          src={convertFileSrc(props.path!)}
          onError={() => setError(true)}
        />
      </Show>
    </div>
  );
}