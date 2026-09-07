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

import { createEffect, createSignal, on, onMount, Show } from "solid-js";
import { browseCovers, coversEnabledSignal, type CoverState } from "../browse/browse-covers";
import { BookIcon, Icon, ImageIcon } from "./Icon";
import { t } from "../i18n";
import { useImageRetry } from "../hooks/useImageRetry";
import { resolveCoverSrc } from "./Cover";
import { log } from "../utils/log";
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
}

const SIZES = {
  feed: {
    wrapClass: "",
    imgClass: "",
    placeholderClass: "",
  },
  cache: {
    wrapClass: "ds-feed-cover-wrap--cache",
    imgClass: "ds-feed-cover--cache",
    placeholderClass: "ds-feed-cover-placeholder--cache",
  },
} as const;

export function HydratedCover(props: HydratedCoverProps) {
  const { error, isRetrying, handleError, retry, reset, retryNonce } = useImageRetry();
  let wrapEl: HTMLDivElement | undefined;
  const [failedPath, setFailedPath] = createSignal<string | null>(null);

  const resolvedPath = () => {
    const p = props.path;
    if (p && p !== failedPath()) return p;
    return props.coverKey ? browseCovers.getCover(props.coverKey) : undefined;
  };

  const baseSrc = () => resolveCoverSrc(resolvedPath());

  const imgSrc = () => {
    const src = baseSrc();
    if (!src) return "";
    const nonce = retryNonce();
    if (nonce <= 0) return src;
    const sep = src.includes("?") ? "&" : "?";
    return `${src}${sep}v=${nonce}`;
  };

  const isLoaded = () =>
    Boolean(resolvedPath()) &&
    Boolean(baseSrc()) &&
    !error() &&
    coversEnabledSignal();

  createEffect(
    on(
      () => [props.path, props.coverKey] as const,
      () => {
        setFailedPath(null);
        reset();
      },
      { defer: true },
    ),
  );
  // Keep unhydrated element observed whenever covers are enabled
  createEffect(() => {
    const p = resolvedPath();
    const enabled = coversEnabledSignal();
    if (wrapEl && !p && enabled) {
      browseCovers.observe(wrapEl, props.coverKey);
    }
  });

  onMount(() => {
    if (wrapEl && !resolvedPath() && coversEnabledSignal()) {
      browseCovers.observe(wrapEl, props.coverKey);
    }
  });

  const triggerRetry = () => {
    if (props.coverKey && props.chapterPermalink) {
      browseCovers.retryCover({
        coverKey: props.coverKey,
        chapterPermalink: props.chapterPermalink,
        seriesPermalink: props.seriesPermalink || null,
        seriesType: props.seriesType || null,
      }, wrapEl);
    }
  };

  const handleImageError = (ev: Event) => {
    const target = ev.currentTarget as HTMLImageElement | null;
    log.debug("cover-ui", "cover img onError for", props.coverKey, target?.src);
    const broken = resolvedPath();
    if (broken) {
      setFailedPath(broken);
    }
    // Immediately purge the broken/missing file path from memory and SQLite
    if (props.coverKey) {
      browseCovers.evict(props.coverKey);
    }
    handleError(() => {
      triggerRetry();
    });
  };

  const handleClick = (ev: MouseEvent) => {
    if (!isLoaded()) {
      setFailedPath(null);
      retry(() => triggerRetry());
    }
    props.onClick?.(ev);
  };

  const size = () => SIZES[props.size ?? "feed"];
  const isCache = () => props.size === "cache";

  const currentState = (): CoverState => {
    if (!coversEnabledSignal()) return "no-cover";
    if (isRetrying()) return "loading";
    if (error()) return "no-cover";
    if (resolvedPath()) return "loaded";
    return browseCovers.getCoverState(props.coverKey);
  };
  const stateTitle = (): string => {
    const st = currentState();
    if (st === "downloading") return t("cover.downloading");
    if (st === "processing") return t("cover.processing");
    if (st === "loading") return t("cover.loading");
    if (st === "no-cover" && error()) return t("cover.retryTooltip");
    if (st === "no-cover") return t("cover.noCover");
    return props.title || props.coverKey;
  };
  return (
    <div
      ref={(el) => {
        wrapEl = el;
      }}
      class={`ds-feed-cover-wrap${size().wrapClass ? ` ${size().wrapClass}` : ""}`}
      data-feed-cover={props.coverKey}
      data-chapter-permalink={props.chapterPermalink}
      data-series-permalink={props.seriesPermalink}
      data-series-type={props.seriesType}
      title={stateTitle()}
      onClick={handleClick}
    >
      <Show
        when={isLoaded()}
        fallback={
          <div
            class={`ds-feed-cover-placeholder ds-cover-state--${currentState()}${size().placeholderClass ? ` ${size().placeholderClass}` : ""}`}
            title={stateTitle()}
          >
            <Show when={currentState() === "downloading"}>
              <Icon name="cloud-arrow-down" class="ds-cover-icon-pulse" />
            </Show>
            <Show when={currentState() === "processing"}>
              <Icon name="gear-wide-connected" class="ds-cover-icon-spin" />
            </Show>
            <Show when={currentState() === "loading"}>
              <ImageIcon />
            </Show>
            <Show when={currentState() === "no-cover" || currentState() === "loaded"}>
              <BookIcon />
            </Show>
          </div>
        }
      >
        <img
          class={`ds-feed-cover${size().imgClass ? ` ${size().imgClass}` : ""}`}
          alt={props.coverKey}
          width={isCache() ? 36 : 42}
          height={isCache() ? 50 : 58}
          decoding="async"
          src={imgSrc()}
          onError={handleImageError}
        />
      </Show>
    </div>
  );
}