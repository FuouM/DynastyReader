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
import { Button } from "./Button";

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
      class="ds-pager-widget"
      style={props.cssText}
    >
      <Button
        className="ds-btn-icon"
        title={t("dialogs.pager.firstPage")}
        disabled={props.currentPage <= 1}
        onClick={() => props.onPage(1)}
        icon={<ChevronDoubleLeftIcon />}
      />
      <Button
        className="ds-btn-icon"
        title={t("dialogs.pager.prevPage")}
        disabled={props.currentPage <= 1}
        onClick={() => props.onPage(props.currentPage - 1)}
        icon={<ChevronLeftIcon />}
      />

      <div class="ds-pager-row">
        <span class="ds-progress-text ds-pager-label">
          {t("dialogs.pager.pageLabel")}
        </span>
        <input
          type="number"
          min="1"
          max={String(Math.max(1, props.totalPages))}
          value={jumpValue()}
          class="input-field ds-pager-input"
          title={t("dialogs.pager.jumpPrompt")}
          onInput={(ev) => setJumpValue((ev.target as HTMLInputElement).value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              doJump();
            }
          }}
        />
        <span class="ds-progress-text ds-pager-label">
          {t("dialogs.pager.ofTotal", { total: props.totalPages })}
        </span>
        <Button
          className="ds-btn-sm ds-pager-go-btn"
          title={t("dialogs.pager.jumpButton")}
          onClick={doJump}
        >
          {t("dialogs.pager.jumpButton")}
        </Button>
      </div>

      <Button
        className="ds-btn-icon"
        title={t("dialogs.pager.nextPage")}
        disabled={props.currentPage >= props.totalPages}
        onClick={() => props.onPage(props.currentPage + 1)}
        icon={<ChevronRightIcon />}
      />
      <Button
        className="ds-btn-icon"
        title={t("dialogs.pager.lastPage", { total: props.totalPages })}
        disabled={props.currentPage >= props.totalPages}
        onClick={() => props.onPage(props.totalPages)}
        icon={<ChevronDoubleRightIcon />}
      />
    </div>
  );
}