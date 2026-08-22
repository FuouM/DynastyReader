/**
 * Reusable pagination widget for Browse and Library views. Port of `pager.ts`.
 * Icon-only First, Previous, Page N of Total with Jump-to-Page input & Go, Next, and Last.
 */

import { createSignal, createEffect } from "solid-js";
import { t } from "../i18n";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from "./Icon";

export interface PagerProps {
  totalPages: number;
  currentPage: number;
  onPage: (p: number) => void;
  cssText?: string;
}

export function Pager(props: PagerProps) {
  const [jumpValue, setJumpValue] = createSignal<string>(String(props.currentPage));

  createEffect(() => {
    setJumpValue(String(props.currentPage));
  });

  const doJump = (): void => {
    const target = parseInt(jumpValue(), 10);
    if (!isNaN(target)) {
      const clamped = Math.max(1, Math.min(props.totalPages, target));
      if (clamped !== props.currentPage) {
        props.onPage(clamped);
      }
    }
  };

  return (
    <div
      class="ds-row ds-pager-widget"
      style={props.cssText ?? "align-items:center;justify-content:flex-end;gap:4px;margin-top:8px;flex-wrap:wrap;"}
    >
      <button
        type="button"
        class="win-button ds-btn-xs"
        title={t("dialogs.pager.firstPage")}
        disabled={props.currentPage <= 1}
        onClick={() => props.onPage(1)}
      >
        <ChevronDoubleLeftIcon />
      </button>
      <button
        type="button"
        class="win-button ds-btn-xs"
        title={t("dialogs.pager.prevPage")}
        disabled={props.currentPage <= 1}
        onClick={() => props.onPage(props.currentPage - 1)}
      >
        <ChevronLeftIcon />
      </button>

      <div class="ds-row" style="align-items:center;gap:3px;margin:0 2px;">
        <span class="ds-progress-text" style="font-size:11px;color:var(--sys-text-muted, #666);">
          Page
        </span>
        <input
          type="number"
          min="1"
          max={String(Math.max(1, props.totalPages))}
          value={jumpValue()}
          class="input-field"
          style="width:42px;height:20px;text-align:center;font-size:11px;padding:1px 2px;"
          title={t("dialogs.pager.jumpPrompt")}
          onInput={(ev) => setJumpValue((ev.target as HTMLInputElement).value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              doJump();
            }
          }}
        />
        <span class="ds-progress-text" style="font-size:11px;color:var(--sys-text-muted, #666);">
          of {props.totalPages}
        </span>
        <button type="button" class="win-button ds-btn-xs" title={t("dialogs.pager.jumpButton")} onClick={doJump}>
          {t("dialogs.pager.jumpButton")}
        </button>
      </div>

      <button
        type="button"
        class="win-button ds-btn-xs"
        title={t("dialogs.pager.nextPage")}
        disabled={props.currentPage >= props.totalPages}
        onClick={() => props.onPage(props.currentPage + 1)}
      >
        <ChevronRightIcon />
      </button>
      <button
        type="button"
        class="win-button ds-btn-xs"
        title={t("dialogs.pager.lastPage", { total: props.totalPages })}
        disabled={props.currentPage >= props.totalPages}
        onClick={() => props.onPage(props.totalPages)}
      >
        <ChevronDoubleRightIcon />
      </button>
    </div>
  );
}