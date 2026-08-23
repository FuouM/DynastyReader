import { createEffect, on, Show } from "solid-js";
import { convertFileSrc } from "../ipc";
import { ImageIcon, Icon, type BootstrapIconName } from "./Icon";
import { useImageRetry } from "../hooks/useImageRetry";

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
  const { retryNonce, handleError, retry, reset, showImage } = useImageRetry();

  createEffect(
    on(
      () => [props.path, retryNonce()] as const,
      () => reset(),
      { defer: true },
    ),
  );

  const isValidLocalPath = () =>
    Boolean(props.path) &&
    (props.path!.includes("/") || props.path!.includes("\\")) &&
    !props.path!.startsWith("series:") &&
    !props.path!.startsWith("chapter:");

  const showCover = () => showImage(isValidLocalPath() && props.path !== undefined && props.path !== null);

  const handlePlaceholderClick = (ev: MouseEvent) => {
    if (props.path) {
      retry();
    }
    props.onClick?.(ev);
  };

  return (
    <Show
      when={showCover()}
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
        onError={() => handleError()}
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