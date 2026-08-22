import { createResource, createSignal, For, Show } from "solid-js";
import {
  addBlacklistedTag,
  getBlacklistedTags,
  removeBlacklistedTag,
  getBlacklistMode,
  setBlacklistMode,
  type BlacklistedTag,
} from "../../db";
import { suggest } from "../../api";
import { Typeahead } from "../Typeahead";
import { BlacklistIcon, AddIcon, CloseIcon } from "../Icon";

export function BlacklistSettings() {
  const [blMode, setBlMode] = createSignal(getBlacklistMode());
  const [blInput, setBlInput] = createSignal("");
  const [blacklist, { refetch }] = createResource(() => getBlacklistedTags());

  const setMode = (mode: "hide" | "warn"): void => {
    setBlMode(mode);
    setBlacklistMode(mode);
  };

  const addTag = async (name: string, permalink?: string): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await addBlacklistedTag(trimmed, permalink);
      setBlInput("");
      refetch();
    } catch (err) {
      console.error("[settings] failed to add blacklist tag:", err);
    }
  };

  const removeTag = async (name: string): Promise<void> => {
    try {
      await removeBlacklistedTag(name);
      refetch();
    } catch (err) {
      console.error("[settings] failed to remove blacklist tag:", err);
    }
  };

  return (
    <div class="group-box" id="ds-settings-sec-blacklist">
      <div class="group-box-title">
        <BlacklistIcon /> Tag Blacklist
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
          Hide or show trigger warnings for releases and chapters matching these tags.
        </div>

        {/* Mode Selector */}
        <div style="display:flex;align-items:center;gap:12px;background:var(--sys-bg-active,#f8f9fa);border:1px solid var(--sys-border-light,#e2e2e2);border-radius:3px;padding:4px 8px;">
          <span style="font-size:11px;font-weight:600;color:var(--sys-window-text,#333);">
            Mode:
          </span>
          <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">
            <input
              type="radio"
              name="ds-bl-mode"
              value="hide"
              id="ds-bl-mode-hide"
              checked={blMode() === "hide"}
              onChange={() => setMode("hide")}
            />
            <span>Hide releases</span>
          </label>
          <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">
            <input
              type="radio"
              name="ds-bl-mode"
              value="warn"
              id="ds-bl-mode-warn"
              checked={blMode() === "warn"}
              onChange={() => setMode("warn")}
            />
            <span>Trigger warning on click</span>
          </label>
        </div>

        {/* Add Tag Input */}
        <div style="display:flex;gap:6px;position:relative;">
          <div style="flex:1;">
            <Typeahead
              fetcher={suggest}
              value={blInput()}
              onInputValue={(val) => setBlInput(val)}
              onSelect={(item) => {
                const permalink = "permalink" in item && typeof item.permalink === "string" ? item.permalink : undefined;
                void addTag(item.name, permalink);
              }}
              onEnter={(val) => void addTag(val || blInput())}
              placeholder="Search or enter tag to blacklist (e.g. NSFW, Het)..."
              maxItems={6}
              debounceMs={200}
            />
          </div>
          <button
            type="button"
            class="win-button"
            id="ds-settings-blacklist-add"
            style="font-size:11px;padding:2px 10px;"
            onClick={() => void addTag(blInput())}
          >
            <AddIcon /> Add
          </button>
        </div>

        {/* Blacklisted Tag Chips */}
        <div
          id="ds-settings-blacklist-chips"
          style="display:flex;flex-wrap:wrap;gap:4px;min-height:22px;max-height:120px;overflow-y:auto;padding:2px 0;"
        >
          <Show
            when={blacklist.error}
            fallback={
              <Show
                when={blacklist.loading}
                fallback={
                  <Show
                    when={blacklist() && blacklist()!.length > 0}
                    fallback={
                      <span class="ds-muted" style="font-size:10px;padding:2px 0;">
                        No tags blacklisted.
                      </span>
                    }
                  >
                    <For each={blacklist()!}>
                      {(item: BlacklistedTag) => (
                        <span
                          class="ds-row"
                          style="background:var(--ds-danger-bg);color:var(--ds-danger-text);border:1px solid var(--ds-danger-border);border-radius:3px;padding:1px 6px;font-size:10px;align-items:center;gap:4px;"
                        >
                          <span>{item.tag_name}</span>
                          <CloseIcon
                            style={{ cursor: "pointer", "font-size": "13px" }}
                            title="Remove from blacklist"
                            onClick={() => void removeTag(item.tag_name)}
                          />
                        </span>
                      )}
                    </For>
                  </Show>
                }
              >
                <span class="ds-muted" style="font-size:10px;">Loading blacklist…</span>
              </Show>
            }
          >
            <span
              class="ds-muted"
              style="font-size:10px;color:var(--ds-danger-text);padding:2px 0;"
            >
              Could not load blacklist. Check the application log.
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
}
