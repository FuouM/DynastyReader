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
import { t } from "../../i18n";
import { Typeahead } from "../Typeahead";
import { GroupBox } from "../GroupBox";
import { BlacklistIcon, AddIcon, CloseIcon } from "../Icon";
import { Icon } from "../Icon";
import { IconText, Button, SegmentedSwitch } from "../Button";
export function BlacklistSettings() {
  const [blMode, setBlMode] = createSignal(getBlacklistMode());
  const [blInput, setBlInput] = createSignal("");
  const [blacklist, { refetch }] = createResource(() => getBlacklistedTags());

  const setMode = (mode: "hide" | "warn" | "ghost"): void => {
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
    <GroupBox id="ds-settings-sec-blacklist" title={<IconText icon={<BlacklistIcon />}>{t("blacklist.settingsTitle")}</IconText>}>
      <div class="ds-bl-view-stack">
        <div class="ds-muted">
          {t("blacklist.settingsDescription")}
        </div>
        {/* Mode Selector */}
        <div class="ds-bl-mode-bar">
          <span class="ds-bl-mode-label">
            {t("blacklist.modeHeader")}:
          </span>
          <SegmentedSwitch
            id="ds-bl-mode-switch"
            value={blMode()}
            onChange={(val) => setMode(val as "hide" | "warn" | "ghost")}
            options={[
              { id: "ds-bl-mode-hide", value: "hide", icon: <Icon name="eye-slash" />, text: t("blacklist.modeHide") },
              { id: "ds-bl-mode-ghost", value: "ghost", icon: <Icon name="eye-slash-fill" />, text: t("blacklist.modeGhost") },
              { id: "ds-bl-mode-warn", value: "warn", icon: <Icon name="exclamation-triangle" />, text: t("blacklist.modeWarn") },
            ]}
          />
        </div>

        {/* Add Tag Input */}
        <div class="ds-bl-input-row">
          <div class="ds-flex-1">
            <Typeahead
              fetcher={suggest}
              value={blInput()}
              onInputValue={(val) => setBlInput(val)}
              onSelect={(item) => {
                const permalink = "permalink" in item && typeof item.permalink === "string" ? item.permalink : undefined;
                void addTag(item.name, permalink);
              }}
              onEnter={(val) => void addTag(val || blInput())}
              placeholder={t("blacklist.addTagPlaceholder")}
              maxItems={6}
              debounceMs={200}
            />
          </div>
          <Button
            id="ds-settings-blacklist-add"
            cssText="font-size:11px;padding:2px 10px;"
            icon={<AddIcon />}
            text={t("blacklist.addTagButton")}
            onClick={() => void addTag(blInput())}
          />
        </div>

        {/* Blacklisted Tag Chips */}
        <div
          id="ds-settings-blacklist-chips"
          class="ds-bl-chips"
        >
          <Show when={blacklist.error}>
            <span class="ds-muted ds-bl-chips-error">
              {t("blacklist.loadTagsError")}
            </span>
          </Show>
          <Show when={!blacklist.error && blacklist.loading}>
            <span class="ds-muted">{t("blacklist.loadingTags")}</span>
          </Show>
          <Show when={!blacklist.error && !blacklist.loading && blacklist() && blacklist()!.length === 0}>
            <span class="ds-muted">{t("blacklist.noTags")}</span>
          </Show>
          <Show when={!blacklist.error && !blacklist.loading && blacklist() && blacklist()!.length > 0}>
            <For each={blacklist()!}>
              {(item: BlacklistedTag) => (
                <span class="ds-bl-chip">
                  <span>{item.tag_name}</span>
                  <CloseIcon
                    class="ds-bl-chip-remove"
                    title={t("blacklist.removeTagTooltip")}
                    onClick={() => void removeTag(item.tag_name)}
                  />
                </span>
              )}
            </For>
          </Show>
        </div>
      </div>
    </GroupBox>
  );
}
