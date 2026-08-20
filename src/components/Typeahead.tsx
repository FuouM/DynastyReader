/**
 * Debounced fetch-on-input typeahead component. Port of `typeahead.ts`.
 *
 * Owns its input and suggestion dropdown. Renders `ds-typeahead-item` rows
 * (mousedown selects), hides on Escape/blur/empty, and calls `onEnter` when
 * Enter is pressed in the input. The clear-button and suggestion host are
 * component-local (the global `setupInputClearButtons` delegation is retired).
 */

import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { decodeEntities } from "../stores";

export interface TypeaheadItem {
  name: string;
  type: string;
}

export interface TypeaheadProps {
  id?: string;
  fetcher: (q: string) => Promise<TypeaheadItem[]>;
  onSelect: (item: TypeaheadItem) => void;
  onEnter?: (value: string) => void;
  onEmpty?: () => void;
  onInputValue?: (value: string) => void;
  placeholder?: string;
  maxItems?: number;
  debounceMs?: number;
  /** Optional controlled value; when provided the input mirrors it externally. */
  value?: string;
}

export function Typeahead(props: TypeaheadProps) {
  const [inputValue, setInputValue] = createSignal(props.value ?? "");
  const [suggestions, setSuggestions] = createSignal<TypeaheadItem[]>([]);
  const [open, setOpen] = createSignal(false);
  const [isFocused, setIsFocused] = createSignal(false);
  const maxItems = props.maxItems ?? 8;
  const debounceMs = props.debounceMs ?? 200;

  let timer: number | undefined;

  onCleanup(() => {
    window.clearTimeout(timer);
  });

  // Mirror externally-controlled value into the internal state.
  createEffect(() => {
    if (props.value !== undefined && props.value !== inputValue()) {
      setInputValue(props.value);
    }
  });

  createEffect(() => {
    const val = inputValue().trim();
    window.clearTimeout(timer);
    if (!val) {
      setSuggestions([]);
      setOpen(false);
      props.onEmpty?.();
      return;
    }
    timer = window.setTimeout(async () => {
      let items: TypeaheadItem[];
      try {
        items = await props.fetcher(val);
      } catch {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      setSuggestions(items.slice(0, maxItems));
      if (isFocused()) {
        setOpen(true);
      }
    }, debounceMs);
  });

  return (
    <Show when={props.fetcher !== undefined}>
      <div class="input-wrapper" classList={{ "has-value": inputValue().length > 0 }}>
        <input
          type="text"
          id={props.id}
          class="input-field has-clear"
          placeholder={props.placeholder}
          value={inputValue()}
          onFocus={() => {
            setIsFocused(true);
            if (suggestions().length > 0 && inputValue().trim()) {
              setOpen(true);
            }
          }}
          onInput={(ev) => {
            const v = (ev.target as HTMLInputElement).value;
            setInputValue(v);
            props.onInputValue?.(v);
          }}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") {
              if (inputValue().trim()) props.onEnter?.(inputValue());
            } else if (ev.key === "Escape") {
              setOpen(false);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setIsFocused(false);
              setOpen(false);
            }, 150);
          }}
        />
        <button
          type="button"
          class="input-clear-btn"
          tabIndex={-1}
          title="Clear"
          onClick={() => {
            setInputValue("");
            setSuggestions([]);
            setOpen(false);
            props.onInputValue?.("");
          }}
        >
          <i class="bi bi-x-lg"></i>
        </button>
        <Show when={open()}>
          <div class="ds-typeahead" style="max-height:160px;">
            <For each={suggestions()}>
              {(item) => (
                <div
                  class="ds-typeahead-item"
                  onMouseDown={() => {
                    props.onSelect(item);
                    setOpen(false);
                  }}
                >
                  <span class="ds-fill ds-truncate">{decodeEntities(item.name)}</span>
                  <span class="ds-typeahead-type">{decodeEntities(item.type)}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}