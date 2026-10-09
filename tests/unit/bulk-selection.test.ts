import { describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { useBulkSelection } from "../../src/hooks/useBulkSelection";

describe("hooks/useBulkSelection", () => {
  it("starts selection mode with a specific item on long-press", () => {
    createRoot((dispose) => {
      const onDelete = vi.fn().mockResolvedValue(undefined);
      const onDeleted = vi.fn();
      const bulk = useBulkSelection<string>(onDelete, onDeleted);

      expect(bulk.selectMode()).toBe(false);
      expect(bulk.selected().size).toBe(0);

      // Long-press activates selection mode and selects the target item
      bulk.startSelectionWith("item-1");
      expect(bulk.selectMode()).toBe(true);
      expect(bulk.selected().has("item-1")).toBe(true);
      expect(bulk.selected().size).toBe(1);

      // Toggling another item in selection mode
      bulk.toggleRow("item-2");
      expect(bulk.selected().has("item-2")).toBe(true);
      expect(bulk.selected().size).toBe(2);

      // Toggling first item off
      bulk.toggleRow("item-1");
      expect(bulk.selected().has("item-1")).toBe(false);
      expect(bulk.selected().size).toBe(1);

      dispose();
    });
  });

  it("deletes selected items and resets selection mode", async () => {
    await new Promise<void>((resolve) => {
      createRoot(async (dispose) => {
        const onDelete = vi.fn().mockResolvedValue(undefined);
        const onDeleted = vi.fn();
        const bulk = useBulkSelection<string>(onDelete, onDeleted);

        bulk.startSelectionWith("item-a");
        bulk.toggleRow("item-b");

        await bulk.deleteSelected();
        expect(onDelete).toHaveBeenCalledWith(["item-a", "item-b"]);
        expect(onDeleted).toHaveBeenCalled();
        expect(bulk.selectMode()).toBe(false);
        expect(bulk.selected().size).toBe(0);

        dispose();
        resolve();
      });
    });
  });
});
