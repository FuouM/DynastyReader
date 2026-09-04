import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { t } from "../i18n";
import { showBanner } from "../stores";
import { errorMessage } from "../utils/errors";
import { formatBytes } from "../utils/formatting";
import { Modal } from "../components/Modal";
import { IconButton, DsSelect, type SelectOption } from "../components/Button";
import { Icon, CheckIcon, ClipboardIcon } from "../components/Icon";
import {
  fetchAndFormatExport,
  getCollections,
  type ExportScope,
  type ExportFormat,
  type ExportCounts,
  type CollectionRow,
} from "../db";

export interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  initialScope?: ExportScope;
  initialCollectionId?: number;
  collectionName?: string;
}

export function ExportModal(props: ExportModalProps) {
  const [scope, setScope] = createSignal<ExportScope>(props.initialScope ?? "followed");
  const [format, setFormat] = createSignal<ExportFormat>("json-pretty");
  const [exportedText, setExportedText] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const [collections, setCollections] = createSignal<CollectionRow[]>([]);
  const [selectedColIds, setSelectedColIds] = createSignal<Set<number>>(new Set());
  const [counts, setCounts] = createSignal<ExportCounts>({
    followed: 0,
    collections: 0,
    collectionItems: 0,
  });

  let textareaRef: HTMLTextAreaElement | undefined;
  let copyTimer: number | null = null;
  let fetchToken = 0;

  onCleanup(() => {
    if (copyTimer !== null) window.clearTimeout(copyTimer);
  });

  const loadCollections = async (): Promise<CollectionRow[]> => {
    try {
      const cols = await getCollections();
      setCollections(cols);
      return cols;
    } catch {
      return [];
    }
  };

  onMount(() => {
    void loadCollections();
  });

  // Reset scope and selections when opening
  createEffect(() => {
    if (props.open) {
      setCopied(false);
      void loadCollections().then((cols) => {
        if (props.initialCollectionId !== undefined) {
          setSelectedColIds(new Set([props.initialCollectionId]));
          setScope("selected_collections");
        } else {
          setSelectedColIds(new Set(cols.map((c) => c.id)));
          setScope(props.initialScope ?? "followed");
        }
      });
    }
  });

  // Re-fetch and re-format export text whenever open, scope, format, or selected collections change
  createEffect(() => {
    if (!props.open) return;

    const currentScope = scope();
    const currentFormat = format();
    const currentSelectedIds = selectedColIds();
    const token = ++fetchToken;

    let targetIds: number[] | undefined;
    if (currentScope === "selected_collections" || currentScope === "collection") {
      targetIds = Array.from(currentSelectedIds);
    }

    setLoading(true);
    void fetchAndFormatExport({
      scope: currentScope,
      collectionIds: targetIds,
      format: currentFormat,
    })
      .then((result) => {
        if (token !== fetchToken) return;
        setExportedText(result.text);
        setCounts(result.counts);
      })
      .catch((err) => {
        if (token !== fetchToken) return;
        const msg = errorMessage(err);
        setExportedText(`// Error generating export: ${msg}`);
      })
      .finally(() => {
        if (token === fetchToken) {
          setLoading(false);
        }
      });
  });

  const totalItemCount = (): number => {
    const c = counts();
    const s = scope();
    if (s === "followed") return c.followed;
    if (s === "collections" || s === "collection" || s === "selected_collections") {
      return c.collectionItems;
    }
    return c.followed + c.collectionItems;
  };

  const handleCopy = async (): Promise<void> => {
    const text = exportedText();
    if (!text) return;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (textareaRef) {
        textareaRef.select();
        document.execCommand("copy");
      }
      setCopied(true);
      if (copyTimer !== null) window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => setCopied(false), 2000);

      const count = totalItemCount();
      showBanner(
        t("library.exportCopyBanner", {
          count,
          noun: count === 1 ? t("library.nounItem") : t("library.nounItems"),
        }),
      );
    } catch (err) {
      if (textareaRef) {
        textareaRef.select();
        try {
          document.execCommand("copy");
          setCopied(true);
          if (copyTimer !== null) window.clearTimeout(copyTimer);
          copyTimer = window.setTimeout(() => setCopied(false), 2000);
          return;
        } catch {
          // ignore
        }
      }
      const msg = errorMessage(err);
      showBanner(t("library.exportCopyError", { msg }));
    }
  };

  const handleSelectAllText = (): void => {
    if (textareaRef) {
      textareaRef.focus();
      textareaRef.select();
    }
  };

  const toggleCollection = (id: number): void => {
    const next = new Set(selectedColIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedColIds(next);
  };

  const selectAllCollections = (): void => {
    setSelectedColIds(new Set(collections().map((c) => c.id)));
  };

  const deselectAllCollections = (): void => {
    setSelectedColIds(new Set<number>());
  };

  const scopeOptions = (): SelectOption[] => {
    const opts: SelectOption[] = [
      { value: "followed", label: t("library.exportScopeFollowed") },
      { value: "selected_collections", label: t("library.exportScopeSelectedCollections") },
      { value: "collections", label: t("library.exportScopeCollections") },
      { value: "all", label: t("library.exportScopeAll") },
    ];
    return opts;
  };

  const formatOptions: SelectOption[] = [
    { value: "json-pretty", label: t("library.exportFormatJsonPretty") },
    { value: "json-compact", label: t("library.exportFormatJsonCompact") },
    { value: "text", label: t("library.exportFormatText") },
    { value: "markdown", label: t("library.exportFormatMarkdown") },
    { value: "urls", label: t("library.exportFormatUrls") },
  ];

  const isSelectedCollectionsScope = () =>
    scope() === "selected_collections" || scope() === "collection";

  return (
    <Modal
      open={props.open}
      backdropId="ds-export-modal-overlay"
      width={560}
      onClose={props.onClose}
      title={
        <span class="ds-icon-text">
          <Icon name="box-arrow-up" color="var(--sys-link, #0078d4)" />
          <span>{t("library.exportModalTitle")}</span>
        </span>
      }
      body={
        <div class="ds-form-stack ds-export-form">
          <div class="ds-export-row">
            <div class="ds-export-field">
              <label class="ds-form-label-sm">{t("library.exportScopeLabel")}</label>
              <DsSelect
                value={scope() === "collection" ? "selected_collections" : scope()}
                options={scopeOptions()}
                disabled={loading()}
                onChange={(val) => setScope(val as ExportScope)}
              />
            </div>
            <div class="ds-export-field">
              <label class="ds-form-label-sm">{t("library.exportFormatLabel")}</label>
              <DsSelect
                value={format()}
                options={formatOptions}
                disabled={loading()}
                onChange={(val) => setFormat(val as ExportFormat)}
              />
            </div>
          </div>

          {/* Collection Checklist when Specific or Selected Collections is active */}
          <Show when={isSelectedCollectionsScope()}>
            <div class="ds-collection-checklist-wrap">
              <div class="ds-collection-check-actions">
                <span class="ds-form-label-sm" style="margin: 0;">
                  {t("library.exportSelectedCollectionsCount", {
                    selected: selectedColIds().size,
                    total: collections().length,
                  })}
                </span>
                <div style="display: flex; gap: 6px;">
                  <button
                    type="button"
                    class="win-button ds-btn-sm"
                    style="font-size: 10px; padding: 1px 6px;"
                    onClick={selectAllCollections}
                  >
                    {t("common.selectAll") ?? "Select All"}
                  </button>
                  <button
                    type="button"
                    class="win-button ds-btn-sm"
                    style="font-size: 10px; padding: 1px 6px;"
                    onClick={deselectAllCollections}
                  >
                    {t("library.exportDeselectAll")}
                  </button>
                </div>
              </div>
              <div class="ds-collection-checklist">
                <For each={collections()}>
                  {(col) => (
                    <label class="ds-collection-check-item">
                      <input
                        type="checkbox"
                        checked={selectedColIds().has(col.id)}
                        onChange={() => toggleCollection(col.id)}
                      />
                      <span class="ds-collection-check-title">{col.name}</span>
                      <Show when={col.is_default}>
                        <span class="ds-muted" style="font-size: 10px;">(Default)</span>
                      </Show>
                      <span class="ds-collection-check-count ds-muted">
                        ({col.itemCount ?? 0} {col.itemCount === 1 ? t("library.nounItem") : t("library.nounItems")})
                      </span>
                    </label>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div class="ds-export-summary-bar">
            <span class="ds-export-summary-text">
              <Show
                when={!loading()}
                fallback={<span>{t("library.exportLoading")}</span>}
              >
                <Show
                  when={totalItemCount() > 0}
                  fallback={<span>{t("library.exportSummaryEmpty")}</span>}
                >
                  <span>
                    {t("library.exportSummary", {
                      count: totalItemCount(),
                      size: formatBytes(exportedText().length),
                    })}
                  </span>
                </Show>
              </Show>
            </span>
            <button
              type="button"
              class="win-button ds-btn-sm"
              disabled={loading() || !exportedText()}
              onClick={handleSelectAllText}
            >
              {t("common.selectAll") ?? "Select All"}
            </button>
          </div>

          <div class="ds-export-preview-wrap">
            <textarea
              ref={textareaRef}
              class="input-field ds-export-textarea"
              readOnly={true}
              rows={isSelectedCollectionsScope() ? 9 : 12}
              value={exportedText()}
              onClick={(ev) => ev.currentTarget.select()}
              placeholder={t("library.exportLoading")}
              spellcheck={false}
            />
          </div>
        </div>
      }
      footer={
        <div class="ds-modal-footer-actions ds-export-footer">
          <button
            type="button"
            class="win-button ds-btn-sm ds-modal-cancel"
            onClick={props.onClose}
          >
            {t("common.cancel")}
          </button>
          <IconButton
            icon={copied() ? <CheckIcon /> : <ClipboardIcon />}
            text={copied() ? t("library.exportCopiedButton") : t("library.exportCopyButton")}
            className={`ds-modal-submit ${copied() ? "ds-btn-success" : "primary"}`}
            disabled={loading() || !exportedText()}
            onClick={() => void handleCopy()}
          />
        </div>
      }
    />
  );
}
