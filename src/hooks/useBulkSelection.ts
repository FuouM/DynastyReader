import { createSignal } from "solid-js";

/**
 * Reusable hook for bulk selection mode (e.g. HistoryPane, BookmarksPane).
 * Manages selectMode toggle, selected item set, and batch deletion.
 */
export function useBulkSelection<T>(
  onDelete: (items: T[]) => Promise<void>,
  onDeleted?: () => void,
) {
  const [selectMode, setSelectMode] = createSignal(false);
  const [selected, setSelected] = createSignal<Set<T>>(new Set());

  const toggleSelectMode = (): void => {
    setSelectMode((v) => !v);
    setSelected(new Set<T>());
  };

  const toggleRow = (item: T): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const deleteSelected = async (): Promise<void> => {
    const items = [...selected()];
    if (items.length === 0) return;
    await onDelete(items);
    setSelected(new Set<T>());
    setSelectMode(false);
    onDeleted?.();
  };

  return {
    selectMode,
    selected,
    toggleSelectMode,
    toggleRow,
    deleteSelected,
  };
}
