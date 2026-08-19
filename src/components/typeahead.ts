import { safeHtml } from "../state";
import { esc } from "../utils/html";

export interface TypeaheadItem {
  name: string;
  type: string;
}

export interface TypeaheadOptions {
  maxItems?: number;
  debounceMs?: number;
  /** Called when Enter is pressed while the input is non-empty. */
  onEnter?: () => void;
  /** Called after the input is cleared. */
  onEmpty?: () => void;
}

function hide(host: HTMLElement): void {
  host.classList.add("ds-hidden");
}

function show(host: HTMLElement): void {
  host.classList.remove("ds-hidden");
}

/** Renders suggestion items into the typeahead host. Returns true if any shown. */
export function renderTypeaheadSuggestions<T extends TypeaheadItem>(
  host: HTMLElement,
  items: T[],
  onSelect: (item: T) => void,
  maxItems = 8,
): boolean {
  host.innerHTML = "";
  const shown = items.slice(0, maxItems);
  if (shown.length === 0) {
    hide(host);
    return false;
  }
  for (const s of shown) {
    const item = document.createElement("div");
    item.className = "ds-typeahead-item";
    item.innerHTML = `<span class="ds-fill ds-truncate">${safeHtml(s.name)}</span><span class="ds-typeahead-type">${esc(s.type)}</span>`;
    item.addEventListener("mousedown", () => {
      onSelect(s);
      hide(host);
    });
    host.appendChild(item);
  }
  show(host);
  return true;
}

/**
 * Debounced fetch-on-input typeahead attached to an input + suggestion host.
 * Renders `ds-typeahead-item` rows (mousedown selects), hides on Escape/blur/empty,
 * and calls `onEnter` when Enter is pressed in the input.
 */
export function attachTypeahead(
  input: HTMLInputElement,
  host: HTMLElement,
  fetcher: (q: string) => Promise<TypeaheadItem[]>,
  onSelect: (item: TypeaheadItem) => void,
  opts: TypeaheadOptions = {},
): void {
  const maxItems = opts.maxItems ?? 8;
  const debounceMs = opts.debounceMs ?? 200;
  let timer: number | undefined;

  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    const val = input.value.trim();
    if (!val) {
      hide(host);
      opts.onEmpty?.();
      return;
    }
    timer = window.setTimeout(async () => {
      let suggestions: TypeaheadItem[];
      try {
        suggestions = await fetcher(val);
      } catch {
        hide(host);
        return;
      }
      renderTypeaheadSuggestions(host, suggestions, onSelect, maxItems);
    }, debounceMs);
  });

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      if (input.value.trim()) opts.onEnter?.();
    } else if (ev.key === "Escape") {
      hide(host);
    }
  });

  input.addEventListener("blur", () => {
    window.setTimeout(() => hide(host), 150);
  });
}