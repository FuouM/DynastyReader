import { createEffect, on, Show, type JSX } from "solid-js";
import { convertFileSrc } from "../ipc";
import { ImageIcon, Icon, type BootstrapIconName } from "./Icon";
import { useImageRetry } from "../hooks/useImageRetry";
import { t } from "../i18n";
export interface CoverProps {
  path?: string | null;
  alt: string;
  imgClass?: string;
  placeholderClass?: string;
  glyphClass?: string;
  iconName?: BootstrapIconName;
  onClick?: (ev: MouseEvent) => void;
  onError?: () => void;
  onRetry?: () => void;
}

export function resolveCoverSrc(path: string | null | undefined): string {
  if (!path) return "";
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:") ||
    path.startsWith("asset:")
  ) {
    return path;
  }
  return convertFileSrc(path);
}

/** A cover <img> that falls back to a placeholder on load error, with automatic and manual retry. */
export function Cover(props: CoverProps) {
  const { retryNonce, isRetrying, handleError, retry, reset, showImage, error } = useImageRetry();

  createEffect(
    on(
      () => props.path,
      () => reset(),
      { defer: true },
    ),
  );

  const isValidLocalPath = () =>
    Boolean(props.path) &&
    (props.path!.includes("/") || props.path!.includes("\\")) &&
    !props.path!.startsWith("series:") &&
    !props.path!.startsWith("chapter:");

  const baseSrc = () => resolveCoverSrc(props.path);

  const imgSrc = () => {
    const src = baseSrc();
    if (!src) return "";
    const nonce = retryNonce();
    if (nonce <= 0) return src;
    const sep = src.includes("?") ? "&" : "?";
    return `${src}${sep}v=${nonce}`;
  };

  const showCover = () =>
    showImage(isValidLocalPath() && Boolean(props.path) && Boolean(baseSrc()));

  const handlePlaceholderClick = (ev: MouseEvent) => {
    if (error() || props.path) {
      retry(() => props.onRetry?.());
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
          isLoading={isRetrying()}
          onClick={handlePlaceholderClick}
        />
      }
    >
      <img
        class={props.imgClass ?? "ds-cover"}
        title={props.alt}
        alt={props.alt}
        src={imgSrc()}
        onError={() => {
          handleError(() => props.onRetry?.());
          props.onError?.();
        }}
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
  isLoading?: boolean;
  onClick?: (ev: MouseEvent) => void;
  children?: JSX.Element;
}) {
  return (
    <div
      class={`${props.placeholderClass ?? "ds-cover-placeholder"} ds-cover-state--${props.isLoading ? "loading" : "no-cover"}`}
      title={props.isLoading ? t("cover.loading") : t("cover.noCover")}
      onClick={props.onClick}
    >
      {props.iconName ? (
        <Icon name={props.iconName} />
      ) : props.glyphClass ? (
        <Icon name={props.glyphClass.replace(/^bi\s+bi-|^bi-/, "") as BootstrapIconName} />
      ) : (
        <ImageIcon />
      )}
      {props.children}
    </div>
  );
}