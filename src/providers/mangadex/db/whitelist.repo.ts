/**
 * MangaDex Tag / Genre Whitelist Repository
 * Exactly like Blacklist, but in reverse:
 * - Default: "Girls' Love" tag active by default (Decision 4C)
 * - Users can add/remove whitelisted tags or toggle the whitelist on/off
 * - Feeds and browse queries filter items according to the whitelist
 */

import { createSignal } from "solid-js";
import { persistedSignal } from "../../../lib/persisted-signal";
import { GIRLS_LOVE_TAG_ID } from "../api/constants";

export interface WhitelistTag {
  id: string;
  name: string;
}

const DEFAULT_WHITELIST: WhitelistTag[] = [
  { id: GIRLS_LOVE_TAG_ID, name: "Girls' Love" },
];

export const [whitelistEnabled, setWhitelistEnabled] = persistedSignal<boolean>(true, {
  name: "ds_mdx_whitelist_enabled",
  serialize: String,
  deserialize: (v) => (v !== null && v !== "" ? v === "true" : true),
});

export const [whitelistedTags, setWhitelistedTags] = persistedSignal<WhitelistTag[]>(
  DEFAULT_WHITELIST,
  {
    name: "ds_mdx_whitelisted_tags",
    serialize: JSON.stringify,
    deserialize: (raw) => {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_WHITELIST;
      } catch {
        return DEFAULT_WHITELIST;
      }
    },
  },
);

const [whitelistRevision, setWhitelistRevision] = createSignal(0);

export function useWhitelistRevision(): () => number {
  return whitelistRevision;
}

export function addWhitelistedTag(tag: WhitelistTag): void {
  setWhitelistedTags((prev) => {
    if (prev.some((t) => t.id === tag.id || t.name.toLowerCase() === tag.name.toLowerCase())) {
      return prev;
    }
    return [...prev, tag];
  });
  setWhitelistRevision((r) => r + 1);
}

export function removeWhitelistedTag(tagIdOrName: string): void {
  setWhitelistedTags((prev) => {
    const next = prev.filter(
      (t) => t.id !== tagIdOrName && t.name.toLowerCase() !== tagIdOrName.toLowerCase(),
    );
    return next;
  });
  setWhitelistRevision((r) => r + 1);
}

export function isItemWhitelisted(itemTags: { name?: string }[]): boolean {
  if (!whitelistEnabled()) return true;
  const list = whitelistedTags();
  if (list.length === 0) return true;
  const names = new Set(list.map((t) => t.name.toLowerCase()));
  return itemTags.some((t) => t.name && names.has(t.name.toLowerCase()));
}
