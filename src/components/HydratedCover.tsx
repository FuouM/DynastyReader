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

import { createEffect, createSignal, Show } from "solid-js";
import { convertFileSrc } from "../ipc";
import { browseCovers, coversEnabledSignal } from "../browse/browse-covers";
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

  const resolvedPath = () => props.path || (props.coverKey ? browseCovers.getCover(props.coverKey) : undefined);
  const isLoaded = () => Boolean(resolvedPath()) && !error() && coversEnabledSignal();

  createEffect(() => {
    if (resolvedPath()) setError(false);
  });

  const size = () => SIZES[props.size ?? "feed"];
  const isCache = () => props.size === "cache";

  return (
    <div
      ref={(el) => {
        if (!resolvedPath() && el) browseCovers.observe(el);
      }}
      class="ds-feed-cover-wrap"
      style={`${size().wrap}${props.cssText ?? ""}`}
      data-feed-cover={props.coverKey}
      data-chapter-permalink={props.chapterPermalink}
      data-series-permalink={props.seriesPermalink}
      data-series-type={props.seriesType}
      title={props.title}
      onClick={props.onClick}
    >
      <Show
        when={isLoaded()}
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
          src={convertFileSrc(resolvedPath()!)}
          onError={() => {
            setError(true);
            if (props.coverKey) browseCovers.evict(props.coverKey);
          }}
        />
      </Show>
    </div>
  );
}