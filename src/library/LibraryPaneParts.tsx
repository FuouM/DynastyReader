/**
 * Building blocks shared by the Library panes and the collection detail view:
 * the load/error gate, the bulk-selection action bar, and long-press selection.
 */

import { Show, type Accessor, type JSX } from "solid-js";
import { Loading, ErrorRetryRow, Button, ConfirmDeleteButton } from "soulwindow/solid";
import { t, getRandomLoadingMessage } from "../i18n";
import { errorMessage } from "../utils/formatting";
import { TrashIcon } from "../components/icons";

/** The subset of `useBulkSelection` state these parts consume. */
export interface BulkSelection<K> {
  selectMode: Accessor<boolean>;
  selected: Accessor<Set<K>>;
  startSelectionWith: (item: K) => void;
  toggleSelectMode: () => void;
  toggleRow: (item: K) => void;
  deleteSelected: () => Promise<void>;
  isAllSelected: (items: K[]) => boolean;
  toggleSelectAll: (items: K[]) => void;
}

/** Long-press on a row: start selecting with it, or toggle it when already selecting. */
export function longPressSelect<K>(selection: BulkSelection<K>, key: K): void {
  if (!selection.selectMode()) {
    selection.startSelectionWith(key);
  } else {
    selection.toggleRow(key);
  }
}

/** Renders children once loaded; otherwise the error row (with retry) or the delayed spinner. */
export function PaneLoadGate(props: {
  loaded: boolean;
  error: unknown;
  showSpinner: boolean;
  onRetry: () => void;
  children: JSX.Element;
}) {
  return (
    <Show
      when={props.loaded}
      fallback={
        <Show
          when={props.error !== undefined}
          fallback={<Show when={props.showSpinner}><Loading message={getRandomLoadingMessage()} /></Show>}
        >
          <ErrorRetryRow message={errorMessage(props.error)} onRetry={props.onRetry} />
        </Show>
      }
    >
      {props.children}
    </Show>
  );
}

/**
 * Bulk-selection action bar. Outside select mode it shows `children` followed by
 * the "Select" button; in select mode it shows select-all, count, delete, cancel.
 */
export function BulkSelectionBar<K>(props: {
  selection: BulkSelection<K>;
  keys: K[];
  style: string;
  children?: JSX.Element;
}) {
  return (
    <div class="ds-bulk-actions-bar" style={props.style}>
      <Show when={!props.selection.selectMode()}>
        {props.children}
        <Button text={t("library.selectModeButton")} onClick={props.selection.toggleSelectMode} />
      </Show>
      <Show when={props.selection.selectMode()}>
        <Button
          text={props.selection.isAllSelected(props.keys) ? t("common.deselectAll") : t("common.selectAll")}
          onClick={() => props.selection.toggleSelectAll(props.keys)}
        />
        <span class="ds-muted" style="font-size:12px;">{t("library.selectedCount", { count: props.selection.selected().size })}</span>
        <ConfirmDeleteButton
          icon={<TrashIcon />}
          text={t("library.deleteSelected", { count: props.selection.selected().size })}
          disabled={props.selection.selected().size === 0}
          onConfirm={props.selection.deleteSelected}
        />
        <Button text={t("common.cancel")} onClick={props.selection.toggleSelectMode} />
      </Show>
    </div>
  );
}
