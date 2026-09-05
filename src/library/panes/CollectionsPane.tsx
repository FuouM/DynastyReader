/**
 * Library Collections & Favorites panel.
 */

import { For, Show } from "solid-js";
import { showBanner } from "../../stores/topbar";
import { t } from "../../i18n";
import { errorMessage } from "../../utils/errors";
import { getCollections, getCollectionsRevision, onCollectionsChanged, deleteCollection } from "../../db/collections.repo";
import type { CollectionRow } from "../../types/db";
import { Loading } from "../../components/Loading";
import { LibraryItemRow } from "../LibraryItemRow";
import { useLibraryPaneResource, type LibraryPaneProps } from "../useLibraryPaneResource";

export interface CollectionsPaneProps extends LibraryPaneProps {
  onOpenDetail: (id: number) => void;
  onCreateNew: () => void;
  onExportCollection?: (id: number, name: string) => void;
}

export function CollectionsPane(props: CollectionsPaneProps) {
  const { data, refetch, showSpinner } = useLibraryPaneResource({
    getRevision: getCollectionsRevision,
    onChanged: onCollectionsChanged,
    fetcher: async () => getCollections(),
    register: props.register,
  });

  const openDetail = (col: CollectionRow): void => {
    props.onOpenDetail(col.id);
  };

  return (
    <Show
      when={data() !== undefined}
      fallback={<Show when={showSpinner()}><Loading /></Show>}
    >
      <Show
        when={data()!.length > 0}
        fallback={<div class="ds-muted">{t("library.emptyCollections")}</div>}
      >
        <For each={data()!}>
          {(col) => (
            <LibraryItemRow
              title={col.name}
              subtitle={`${t("library.itemsCount", { count: col.itemCount ?? 0, noun: col.itemCount === 1 ? t("library.nounItem") : t("library.nounItems") })}${
                col.is_default ? t("library.defaultCollectionBadge") : ""
              }`}
              icon={col.is_default ? "bi-star-fill" : "bi-folder2-open"}
              iconColor={col.is_default ? "#d97706" : "var(--sys-link, #0078d4)"}
              onOpen={() => openDetail(col)}
              actionLabel={t("common.open")}
              actionIcon="bi-folder2-open"
              exportTitle={t("library.exportCollectionTooltip")}
              onExport={
                props.onExportCollection
                  ? () => props.onExportCollection!(col.id, col.name)
                  : undefined
              }
              deleteTitle={t("library.deleteCollectionTooltip")}
              onDelete={
                !col.is_default
                  ? async () => {
                      try {
                        await deleteCollection(col.id);
                        showBanner(t("library.deletedCollectionBanner", { name: col.name }));
                        refetch();
                      } catch (err) {
                        const msg = errorMessage(err);
                        showBanner(t("library.deleteCollectionErrorBanner", { msg }));
                        throw err;
                      }
                    }
                  : undefined
              }
            />
          )}
        </For>
      </Show>
    </Show>
  );
}
