import { createEffect, createSignal, on, Show } from "solid-js";
import { convertFileSrc } from "../ipc";
import { ImageIcon, Icon, type BootstrapIconName } from "./Icon";

export interface CoverProps {
  path?: string | null;
  alt: string;
  imgClass?: string;
  placeholderClass?: string;
  glyphClass?: string;
  iconName?: BootstrapIconName;
}

/** A cover <img> that falls back to a placeholder on load error. */
export function Cover(props: CoverProps) {
  const [error, setError] = createSignal(false);

  createEffect(
    on(
      () => props.path,
      () => setError(false),
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

  return (
    <Show
      when={showImage()}
      fallback={
        <CoverPlaceholder
          placeholderClass={props.placeholderClass}
          glyphClass={props.glyphClass}
          iconName={props.iconName}
        />
      }
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
  iconName?: BootstrapIconName;
}) {
  return (
    <div class={props.placeholderClass ?? "ds-cover-placeholder"}>
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