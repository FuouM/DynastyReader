/**
 * Text input with an inline clear button. Port of `input-field.ts`.
 *
 * The clear-button delegation (`setupInputClearButtons`) is retired in the
 * Solid world: the clear button is a component-local concern. The wrapper
 * toggles `.has-value` so the clear button only shows when the field has text.
 */

import { createEffect, createSignal, type JSX } from "solid-js";
import { t } from "../i18n";
import { CloseIcon } from "./Icon";

export interface InputFieldProps {
  id?: string;
  ref?: (el: HTMLInputElement) => void;
  value?: string;
  placeholder?: string;
  class?: string;
  style?: string;
  wrapperClass?: string;
  wrapperStyle?: string;
  title?: string;
  autocomplete?: string;
  autofocus?: boolean;
  inputmode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
  enterkeyhint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  /** ARIA overrides for composite widgets (e.g. combobox/typeahead). */
  role?: JSX.IntrinsicElements["input"]["role"];
  "aria-autocomplete"?: "none" | "inline" | "list" | "both";
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "aria-activedescendant"?: string;
  onInput?: (value: string) => void;
  onEnter?: () => void;
  onEscape?: () => void;
  onClear?: () => void;
  onKeyDown?: (ev: KeyboardEvent) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Optional content rendered inside the wrapper (e.g. a typeahead dropdown). */
  dropdown?: JSX.Element;
}
export function InputField(props: InputFieldProps) {
  const [value, setValue] = createSignal(props.value ?? "");

  createEffect(() => {
    setValue(props.value ?? "");
  });

  return (
    <div class={`input-wrapper${props.wrapperClass ? ` ${props.wrapperClass}` : ""}`} classList={{ "has-value": value().length > 0 }} style={props.wrapperStyle}>
      <input
        ref={props.ref}
        id={props.id}
        type="text"
        class={`input-field has-clear${props.class ? ` ${props.class}` : ""}`}
        style={props.style}
        placeholder={props.placeholder}
        title={props.title}
        autocomplete={props.autocomplete}
        autofocus={props.autofocus}
        inputmode={props.inputmode}
        role={props.role}
        aria-autocomplete={props["aria-autocomplete"]}
        aria-expanded={props["aria-expanded"]}
        aria-controls={props["aria-controls"]}
        aria-activedescendant={props["aria-activedescendant"]}
        enterkeyhint={props.enterkeyhint}
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
        title={t("common.clear")}
        onClick={() => {
          setValue("");
          props.onInput?.("");
          props.onClear?.();
        }}
      >
        <CloseIcon />
      </button>
      {props.dropdown}
    </div>
  );
}