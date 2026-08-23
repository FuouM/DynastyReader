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
import { DsButton, IconButton } from "./Button";

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
      <IconButton
        className="ds-btn-icon-sm"
        title={t("dialogs.pager.firstPage")}
        disabled={props.currentPage <= 1}
        onClick={() => props.onPage(1)}
        icon={<ChevronDoubleLeftIcon />}
      />
      <IconButton
        className="ds-btn-icon-sm"
        title={t("dialogs.pager.prevPage")}
        disabled={props.currentPage <= 1}
        onClick={() => props.onPage(props.currentPage - 1)}
        icon={<ChevronLeftIcon />}
      />

      <div class="ds-row" style="align-items:center;gap:3px;margin:0 2px;">
        <span class="ds-progress-text" style="font-size:11px;color:var(--sys-text-muted, #666);">
          {t("dialogs.pager.pageLabel")}
        </span>
        <input
          type="number"
          min="1"
          max={String(Math.max(1, props.totalPages))}
          value={jumpValue()}
          class="input-field"
          style="width:44px;height:22px;min-height:22px;max-height:22px;box-sizing:border-box;text-align:center;font-size:11px;padding:1px 2px;line-height:20px;"
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
          {t("dialogs.pager.ofTotal", { total: props.totalPages })}
        </span>
        <DsButton
          className="ds-btn-sm"
          title={t("dialogs.pager.jumpButton")}
          onClick={doJump}
        >
          {t("dialogs.pager.jumpButton")}
        </DsButton>
      </div>

      <IconButton
        className="ds-btn-icon-sm"
        title={t("dialogs.pager.nextPage")}
        disabled={props.currentPage >= props.totalPages}
        onClick={() => props.onPage(props.currentPage + 1)}
        icon={<ChevronRightIcon />}
      />
      <IconButton
        className="ds-btn-icon-sm"
        title={t("dialogs.pager.lastPage", { total: props.totalPages })}
        disabled={props.currentPage >= props.totalPages}
        onClick={() => props.onPage(props.totalPages)}
        icon={<ChevronDoubleRightIcon />}
      />
    </div>
  );
}