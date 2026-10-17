import { showBanner } from "../stores/topbar";
import { errorMessage } from "../utils/formatting";
import { createSignal, createEffect, on } from "solid-js";
import { activeProvider } from "../stores/provider";

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
  // Reset selection when switching content providers to prevent deleting mismatched IDs
  createEffect(
    on(
      activeProvider,
      () => {
        setSelectMode(false);
        setSelected(new Set<T>());
      },
      { defer: true },
    ),
  );

  const toggleSelectMode = (): void => {
    setSelectMode((v) => !v);
    setSelected(new Set<T>());
  };
  const startSelectionWith = (item: T): void => {
    setSelectMode(true);
    setSelected(new Set<T>([item]));
  };

  const toggleRow = (item: T): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };
  const selectAll = (items: T[]): void => {
    setSelected(new Set(items));
  };

  const clearSelection = (): void => {
    setSelected(new Set<T>());
  };

  const isAllSelected = (items: T[]): boolean => {
    return items.length > 0 && selected().size === items.length;
  };

  const toggleSelectAll = (items: T[]): void => {
    if (isAllSelected(items)) {
      clearSelection();
    } else {
      selectAll(items);
    }
  };

  const deleteSelected = async (): Promise<void> => {
    const items = [...selected()];
    if (items.length === 0) return;
    try {
      await onDelete(items);
      setSelected(new Set<T>());
      setSelectMode(false);
      onDeleted?.();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };
  return {
    selectMode,
    selected,
    setSelectMode,
    startSelectionWith,
    toggleSelectMode,
    toggleRow,
    deleteSelected,
    selectAll,
    clearSelection,
    isAllSelected,
    toggleSelectAll,
  };
}
