/**
 * Debounced fetch-on-input typeahead component. Port of `typeahead.ts`.
 *
 * Owns its input and suggestion dropdown. Composes `InputField` (so the
 * clear-button/wrapper markup lives in exactly one place) and renders
 * `ds-typeahead-item` rows inside the input wrapper (mousedown selects),
 * hiding on Escape/blur/empty, and calling `onEnter` when Enter is pressed
 * in the input.
 */

import { createEffect, createSignal, onCleanup, For, Show } from "solid-js";
import { debounce } from "@solid-primitives/scheduled";
import { decodeEntities } from "../stores";
import { InputField } from "./InputField";

export interface TypeaheadItem {
  name: string;
  type: string;
}

export interface TypeaheadProps {
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
  const [selectedIndex, setSelectedIndex] = createSignal<number>(-1);
  const [open, setOpen] = createSignal(false);
  const [isFocused, setIsFocused] = createSignal(false);
  const maxItems = props.maxItems ?? 8;
  const debounceMs = props.debounceMs ?? 200;

  let dropdownRef: HTMLDivElement | undefined;
  let blurTimer: number | null = null;

  onCleanup(() => {
    if (blurTimer !== null) window.clearTimeout(blurTimer);
  });
  // Mirror externally-controlled value into the internal state.
  createEffect(() => {
    if (props.value !== undefined && props.value !== inputValue()) {
      setInputValue(props.value);
    }
  });

  const debouncedFetch = debounce(async (val: string) => {
    let items: TypeaheadItem[];
    try {
      items = await props.fetcher(val);
    } catch {
      setSuggestions([]);
      setSelectedIndex(-1);
      setOpen(false);
      return;
    }
    const sliced = items.slice(0, maxItems);
    setSuggestions(sliced);
    setSelectedIndex(-1);
    if (isFocused() && sliced.length > 0) {
      setOpen(true);
    }
  }, debounceMs);

  createEffect(() => {
    const val = inputValue().trim();
    if (!val) {
      debouncedFetch.clear();
      setSuggestions([]);
      setSelectedIndex(-1);
      setOpen(false);
      props.onEmpty?.();
      return;
    }
    debouncedFetch(val);
  });

  const handleKeyDown = (ev: KeyboardEvent): void => {
    const items = suggestions();
    if (!open() || items.length === 0) return;

    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setSelectedIndex((prev) => {
        const next = prev + 1 >= items.length ? 0 : prev + 1;
        scrollIndexIntoView(next);
        return next;
      });
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setSelectedIndex((prev) => {
        const next = prev - 1 < 0 ? items.length - 1 : prev - 1;
        scrollIndexIntoView(next);
        return next;
      });
    } else if (ev.key === "Enter") {
      const idx = selectedIndex();
      if (idx >= 0 && idx < items.length) {
        ev.preventDefault();
        const selected = items[idx];
        props.onSelect(selected);
        setOpen(false);
        setSelectedIndex(-1);
      }
    } else if (ev.key === "Escape") {
      setOpen(false);
      setSelectedIndex(-1);
    }
  };

  const scrollIndexIntoView = (index: number): void => {
    if (!dropdownRef) return;
    const children = dropdownRef.children;
    if (children && children[index]) {
      (children[index] as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  };

  const dropdown = (
    <Show when={open()}>
      <div ref={dropdownRef} class="ds-typeahead" style="max-height:160px;">
        <For each={suggestions()}>
          {(item, idx) => (
            <div
              class="ds-typeahead-item"
              classList={{ selected: selectedIndex() === idx() }}
              onMouseDown={() => {
                props.onSelect(item);
                setOpen(false);
                setSelectedIndex(-1);
              }}
              onMouseEnter={() => setSelectedIndex(idx())}
            >
              <span class="ds-fill ds-truncate">{decodeEntities(item.name)}</span>
              <span class="ds-typeahead-type">{decodeEntities(item.type)}</span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );

  return (
    <Show when={props.fetcher !== undefined}>
      <InputField
        value={inputValue()}
        placeholder={props.placeholder}
        autocomplete="off"
        inputmode="search"
        enterkeyhint="search"
        onInput={(v) => {
          setInputValue(v);
          props.onInputValue?.(v);
        }}
        onKeyDown={handleKeyDown}
        onEnter={() => {
          if (inputValue().trim()) props.onEnter?.(inputValue());
        }}
        onEscape={() => {
          setOpen(false);
          setSelectedIndex(-1);
        }}
        onClear={() => {
          setInputValue("");
          setSuggestions([]);
          setSelectedIndex(-1);
          setOpen(false);
          props.onInputValue?.("");
        }}
        onFocus={() => {
          setIsFocused(true);
          if (suggestions().length > 0 && inputValue().trim()) {
            setOpen(true);
          }
        }}
        onBlur={() => {
          if (blurTimer !== null) window.clearTimeout(blurTimer);
          blurTimer = window.setTimeout(() => {
            blurTimer = null;
            setIsFocused(false);
            setOpen(false);
            setSelectedIndex(-1);
          }, 150);
        }}
        dropdown={dropdown}
      />
    </Show>
  );
}