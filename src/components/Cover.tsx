/**
 * Cover thumbnail components with error → placeholder fallback. Port of `cover.ts`.
 * Replaces the three divergent cover implementations (Library, Series, Cache).
 */

import { createEffect, createSignal, on, Show } from "solid-js";
import { convertFileSrc } from "../ipc";

export interface CoverProps {
  path?: string | null;
  alt: string;
  imgClass?: string;
  placeholderClass?: string;
}

/** A cover <img> that falls back to a placeholder on load error. */
export function Cover(props: CoverProps) {
  const [error, setError] = createSignal(false);

  createEffect(
    on(
      () => props.path,
      () => setError(false),
      { defer: true }
    )
  );

  const isValidLocalPath = () =>
    Boolean(props.path) &&
    (props.path!.includes("/") || props.path!.includes("\\")) &&
    !props.path!.startsWith("series:") &&
    !props.path!.startsWith("chapter:");

  const showImage = () => isValidLocalPath() && props.path !== undefined && props.path !== null && !error();

  return (
    <Show
      when={showImage()}
      fallback={<CoverPlaceholder placeholderClass={props.placeholderClass} />}
    >
      <img
        class={props.imgClass ?? "ds-cover"}
        title={props.alt}
        alt={props.alt}
        src={convertFileSrc(props.path!)}
        onError={() => setError(true)}
      />
    </Show>
  );
}

/** Static placeholder box with a fallback glyph. */
export function CoverPlaceholder(props: {
  placeholderClass?: string;
  glyphClass?: string;
}) {
  return (
    <div class={props.placeholderClass ?? "ds-cover-placeholder"}>
      <i class={props.glyphClass ?? "bi bi-image"}></i>
    </div>
  );
}

/** Small feed-style cover (42×58) with book-glyph placeholder. */
export function FeedCover(props: {
  path?: string | null;
  coverKey: string;
  cssText?: string;
}) {
  const [error, setError] = createSignal(false);

  createEffect(
    on(
      () => props.path,
      () => setError(false),
      { defer: true }
    )
  );

  return (
    <Show
      when={props.path !== undefined && props.path !== null && !error()}
      fallback={
        <div class="ds-feed-cover-placeholder" style={props.cssText}>
          <i class="bi bi-book"></i>
        </div>
      }
    >
      <img
        class="ds-feed-cover"
        style={props.cssText}
        alt={props.coverKey}
        width={42}
        height={58}
        decoding="async"
        src={convertFileSrc(props.path!)}
        onError={() => setError(true)}
      />
    </Show>
  );
}