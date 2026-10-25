import { persistedSignal } from "../lib/persisted-signal";

export const [showChapterTags, setShowChapterTags] = persistedSignal<boolean>(true, {
  name: "ds_show_chapter_tags",
  deserialize: (v) => (v !== null && v !== "" ? v === "true" : true),
});

export function toggleChapterTags(): void {
  setShowChapterTags((prev) => !prev);
}
