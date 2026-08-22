import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import { convertFileSrc } from "../ipc";
import { ImageIcon, Icon, type BootstrapIconName } from "./Icon";

export interface CoverProps {
  path?: string | null;
  alt: string;
  imgClass?: string;
  placeholderClass?: string;
  glyphClass?: string;
  iconName?: BootstrapIconName;
  onClick?: (ev: MouseEvent) => void;
}

/** A cover <img> that falls back to a placeholder on load error, with automatic and manual retry. */
export function Cover(props: CoverProps) {
  const [error, setError] = createSignal(false);
  const [retryNonce, setRetryNonce] = createSignal(0);
  let retryTimer: number | null = null;
  let retryAttempts = 0;

  onCleanup(() => {
    if (retryTimer !== null) window.clearTimeout(retryTimer);
  });

  createEffect(
    on(
      () => [props.path, retryNonce()] as const,
      () => {
        setError(false);
        retryAttempts = 0;
      },
      { defer: true },
    ),
  );

  const isValidLocalPath = () =>
    Boolean(props.path) &&
    (props.path!.includes("/") || props.path!.includes("\\")) &&
    !props.path!.startsWith("series:") &&
    !props.path!.startsWith("chapter:");

  const showImage = () =>
    isValidLocalPath() && props.path !== undefined && props.path !== null && !error();

  const handleImageError = () => {
    if (retryAttempts < 2) {
      retryAttempts++;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        setError(false);
        setRetryNonce((n) => n + 1);
      }, retryAttempts * 1200);
    } else {
      setError(true);
    }
  };

  const handlePlaceholderClick = (ev: MouseEvent) => {
    if (props.path) {
      retryAttempts = 0;
      setError(false);
      setRetryNonce((n) => n + 1);
    }
    props.onClick?.(ev);
  };

  return (
    <Show
      when={showImage()}
      fallback={
        <CoverPlaceholder
          placeholderClass={props.placeholderClass}
          glyphClass={props.glyphClass}
          iconName={props.iconName}
          onClick={handlePlaceholderClick}
        />
      }
    >
      <img
        class={props.imgClass ?? "ds-cover"}
        title={props.alt}
        alt={props.alt}
        src={convertFileSrc(props.path!)}
        onError={handleImageError}
        onClick={props.onClick}
      />
    </Show>
  );
}

/** Static placeholder box with a fallback glyph. */
export function CoverPlaceholder(props: {
  placeholderClass?: string;
  glyphClass?: string;
  iconName?: BootstrapIconName;
  onClick?: (ev: MouseEvent) => void;
}) {
  return (
    <div class={props.placeholderClass ?? "ds-cover-placeholder"} onClick={props.onClick}>
      {props.iconName ? (
        <Icon name={props.iconName} />
      ) : props.glyphClass ? (
        <Icon name={props.glyphClass.replace(/^bi\s+bi-|^bi-/, "") as BootstrapIconName} />
      ) : (
        <ImageIcon />
      )}
    </div>
  );
}