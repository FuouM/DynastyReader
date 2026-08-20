/**
 * Host hook for the "Add to Collection" pseudo-dropdown modal. Folds the
 * `addToCol`-signal + `<AddToCollectionModal>` boilerplate that four views
 * (BrowseFeed, BrowseSearch, BrowseDownloaded, SeriesView) duplicated
 * verbatim, including the default `{ permalink: "", title: "" }` item noise.
 *
 * Usage: `const addToCol = useAddToCollection();` then call
 * `addToCol.open(item, anchorEl)` from a row/action and render
 * `{addToCol.host}` at the bottom of the view. `onAddToCol` is an alias
 * compatible with row-component prop signatures.
 */

import { createSignal, type JSX } from "solid-js";
import {
  AddToCollectionModal,
  type AddToCollectionItem,
} from "../AddToCollectionModal";

export interface AddToCollectionRequest {
  item: AddToCollectionItem;
  anchorEl: HTMLElement;
}

export interface AddToCollectionApi {
  open: (item: AddToCollectionItem, anchorEl: HTMLElement) => void;
  onAddToCol: (item: AddToCollectionItem, anchorEl: HTMLElement) => void;
  host: JSX.Element;
}

export function useAddToCollection(): AddToCollectionApi {
  const [addToCol, setAddToCol] = createSignal<AddToCollectionRequest | null>(
    null,
  );

  const open = (
    item: AddToCollectionItem,
    anchorEl: HTMLElement,
  ): void => {
    setAddToCol({ item, anchorEl });
  };

  const host = (
    <AddToCollectionModal
      open={addToCol() !== null}
      item={addToCol()?.item ?? { permalink: "", title: "" }}
      anchorEl={addToCol()?.anchorEl ?? null}
      onClose={() => setAddToCol(null)}
    />
  );

  return { open, onAddToCol: open, host };
}