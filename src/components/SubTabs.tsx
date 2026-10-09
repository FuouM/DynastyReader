import { createEffect, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { Button } from "./Button";
export interface SubTab<T extends string = string> {
  id: T;
  label: string;
  shortLabel?: string;
  icon?: string;
  count?: number;
}

export interface SubTabsProps<T extends string = string> {
  tabs: readonly SubTab<T>[];
  activeTab: T;
  onSwitch: (id: T) => void;
  /** Whether to use short labels (e.g. on compact breakpoints). */
  compact?: boolean;
  /** Content rendered on the right side of the tab bar. */
  right?: JSX.Element;
}

/**
 * Horizontal sub-tab bar with segmented buttons and optional right-side actions.
 * Used by BrowseView and LibraryView for their tab navigation rows.
 */
export function SubTabs<T extends string = string>(props: SubTabsProps<T>) {
  let scrollRef: HTMLDivElement | undefined;
  let isDown = false;
  let startX = 0;
  let scrollStart = 0;
  let isDragging = false;

  onMount(() => {
    const el = scrollRef;
    if (!el) return;

    // Convert vertical mouse wheel delta to horizontal scroll on desktop
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) >= Math.abs(e.deltaX) && e.deltaY !== 0) {
        const canScrollLeft = e.deltaY < 0 && el.scrollLeft > 0;
        const canScrollRight = e.deltaY > 0 && el.scrollLeft < el.scrollWidth - el.clientWidth;
        if (canScrollLeft || canScrollRight) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      }
    };

    // Mouse drag-to-scroll support for desktop
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button === 0 && el.scrollWidth > el.clientWidth) {
        isDown = true;
        isDragging = false;
        startX = e.clientX;
        scrollStart = el.scrollLeft;
        try { el.setPointerCapture(e.pointerId); } catch {}
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (!isDragging && Math.abs(dx) > 3) {
        isDragging = true;
        el.classList.add("is-dragging");
      }
      if (isDragging) {
        el.scrollLeft = scrollStart - dx;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDown) return;
      isDown = false;
      if (isDragging) {
        el.classList.remove("is-dragging");
        // Suppress immediate click event on release
        setTimeout(() => {
          isDragging = false;
        }, 50);
      }
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release failure if already uncaptured
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("click", onClickCapture, true);

    onCleanup(() => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("click", onClickCapture, true);
    });
  });

  // Keep active tab visible in the scroll viewport
  createEffect(() => {
    void props.activeTab;
    requestAnimationFrame(() => {
      const activeEl = scrollRef?.querySelector(".ds-subtab.active") as HTMLElement | null;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    });
  });

  return (
    <div class="ds-subtabs">
      <div class="ds-subtabs-left" ref={scrollRef}>
        <For each={props.tabs}>
          {(tab) => (
            <Button
              className={`ds-subtab${props.activeTab === tab.id ? " active" : ""}`}
              title={typeof tab.count === "number" ? `${tab.label} (${tab.count})` : tab.label}
              onClick={() => props.onSwitch(tab.id)}
            >
              {tab.icon ? <i class={`bi ${tab.icon} ds-mr-4`} /> : undefined}
              <span class="ds-subtab-label">{props.compact ? (tab.shortLabel ?? tab.label) : tab.label}</span>
              <Show when={typeof tab.count === "number"}>
                <span class="ds-subtab-count">{tab.count}</span>
              </Show>
            </Button>
          )}
        </For>
      </div>
      <Show when={props.right}>
        <div class="ds-subtabs-right">{props.right}</div>
      </Show>
    </div>
  );
}
