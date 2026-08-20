/**
 * Text input with an inline clear button. Port of `input-field.ts`.
 *
 * The clear-button delegation (`setupInputClearButtons`) is retired in the
 * Solid world: the clear button is a component-local concern. The wrapper
 * toggles `.has-value` so the clear button only shows when the field has text.
 */

import { createEffect, createSignal, type JSX } from "solid-js";

export interface InputFieldProps {
  value?: string;
  placeholder?: string;
  class?: string;
  title?: string;
  onInput?: (value: string) => void;
  onEnter?: () => void;
  onEscape?: () => void;
  onClear?: () => void;
  onKeyDown?: (ev: KeyboardEvent) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Optional content rendered inside the wrapper (e.g. a typeahead dropdown). */
  dropdown?: JSX.Element;
  children?: JSX.Element;
}

export function InputField(props: InputFieldProps) {
  const [value, setValue] = createSignal(props.value ?? "");

  createEffect(() => {
    setValue(props.value ?? "");
  });

  return (
    <div class="input-wrapper" classList={{ "has-value": value().length > 0 }}>
      <input
        type="text"
        class={`input-field has-clear${props.class ? ` ${props.class}` : ""}`}
        placeholder={props.placeholder}
        title={props.title}
        value={value()}
        onFocus={props.onFocus}
        onBlur={props.onBlur}
        onInput={(ev) => {
          const next = (ev.target as HTMLInputElement).value;
          setValue(next);
          props.onInput?.(next);
        }}
        onKeyDown={(ev) => {
          props.onKeyDown?.(ev);
          if (ev.defaultPrevented) return;
          if (ev.key === "Enter") {
            ev.preventDefault();
            props.onEnter?.();
          } else if (ev.key === "Escape") {
            props.onEscape?.();
          }
        }}
      />
      <button
        type="button"
        class="input-clear-btn"
        tabIndex={-1}
        title="Clear"
        onClick={() => {
          setValue("");
          props.onInput?.("");
          props.onClear?.();
        }}
      >
        <i class="bi bi-x-lg"></i>
      </button>
      {props.dropdown}
    </div>
  );
}