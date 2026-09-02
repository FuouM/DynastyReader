/**
 * GroupBox — WinForms fieldset primitive.
 *
 * Consolidates the 15+ raw `<div class="group-box"><div class="group-box-title">`
 * patterns scattered across Browse, Cache, Library, Settings, and Series.
 * Keeps the native `.group-box` / `.group-box-title` / `.group-box-body` DOM
 * so existing CSS (layout, collapsed, between) continues to apply without
 * specificity changes. Collapse is opt-in via `collapsible`.
 */

import { createEffect, createSignal, onCleanup, Show, type JSX } from "solid-js";

export interface GroupBoxProps {
  id?: string;
  /** Title line — typically `<IconText>…</IconText>`. Rendered inside `.group-box-title`. */
  title: JSX.Element;
  /** Optional auxiliary action controls rendered on the top-right header `.group-box-actions`. */
  actions?: JSX.Element;
  /** Extra classes on the outer `.group-box` (e.g. `ds-mb-8`, `ds-library-panel`). */
  class?: string;
  /** Extra classes on the inner `.group-box-body`. */
  bodyClass?: string;
  /** Collapsible fieldset — adds `.collapsed` and a chevron button. */
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  children?: JSX.Element;
}

export function GroupBox(props: GroupBoxProps) {
  let actionsEl: HTMLDivElement | undefined;
  const [actionsWidth, setActionsWidth] = createSignal(0);

  createEffect(() => {
    if (!props.actions) {
      setActionsWidth(0);
      return;
    }
    if (!actionsEl) return;
    const update = () => {
      if (actionsEl) {
        setActionsWidth(actionsEl.offsetWidth);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(actionsEl);
    onCleanup(() => ro.disconnect());
  });

  return (
    <div
      id={props.id}
      class={`group-box${props.class ? ` ${props.class}` : ""}`}
      classList={{
        collapsed: !!(props.collapsible && props.collapsed),
        "group-box--has-actions": !!props.actions,
      }}
      style={actionsWidth() > 0 ? { "--ds-group-actions-w": `${actionsWidth() + 12}px` } : undefined}
    >
      <div
        class="group-box-title"
        classList={{ "group-box-title--collapsible": !!props.collapsible }}
        onClick={props.collapsible ? props.onToggle : undefined}
      >
        {props.title}
        <Show when={props.collapsible}>
          <button
            type="button"
            class="group-box-collapse-btn"
            onClick={(ev) => {
              ev.stopPropagation();
              props.onToggle?.();
            }}
          >
            <i class="bi bi-chevron-down" />
          </button>
        </Show>
      </div>
      <Show when={props.actions}>
        <div ref={(el) => { actionsEl = el; }} class="group-box-actions">
          {props.actions}
        </div>
      </Show>
      <div class={`group-box-body${props.bodyClass ? ` ${props.bodyClass}` : ""}`}>
        {props.children}
      </div>
    </div>
  );
}
