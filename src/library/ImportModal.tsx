import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onMount,
  Show,
  type Accessor,
} from "solid-js";
import { t } from "../i18n";
import { showBanner } from "../stores";
import { errorMessage } from "../utils/errors";
import { Modal } from "../components/Modal";
import { IconButton, DsSelect, type SelectOption } from "../components/Button";
import { InputField } from "../components/InputField";
import { Icon, CheckIcon, ClipboardIcon, WarningIcon } from "../components/Icon";
import {
  validateAndParseImport,
  executeImport,
  getCollections,
  type CollectionRow,
} from "../db";

export interface ImportModalProps {
  open: Accessor<boolean>;
  onClose: () => void;
  initialTarget?: "followed" | "collections" | "collection";
  initialCollectionId?: number;
  collectionName?: string;
  onImported?: () => void;
}

export function ImportModal(props: ImportModalProps) {
  const [rawText, setRawText] = createSignal("");
  const [targetMode, setTargetMode] = createSignal<"auto" | "followed" | "collection">("auto");
  const [selectedCollectionId, setSelectedCollectionId] = createSignal<number>(1);
  const [isCreatingNewCol, setIsCreatingNewCol] = createSignal(false);
  const [newCollectionName, setNewCollectionName] = createSignal("");
  const [collections, setCollections] = createSignal<CollectionRow[]>([]);
  const [importing, setImporting] = createSignal(false);

  // Load existing collections for target selector
  const loadCollections = async (): Promise<void> => {
    try {
      const cols = await getCollections();
      setCollections(cols);
      if (props.initialCollectionId !== undefined) {
        setSelectedCollectionId(props.initialCollectionId);
      } else if (cols.length > 0) {
        setSelectedCollectionId(cols[0].id);
      }
    } catch {
      // ignore
    }
  };

  onMount(() => {
    void loadCollections();
  });

  // Reset state when opening
  createEffect(() => {
    if (props.open()) {
      setRawText("");
      setImporting(false);
      setIsCreatingNewCol(false);
      setNewCollectionName("");
      void loadCollections();

      if (props.initialTarget === "collection") {
        setTargetMode("collection");
        if (props.initialCollectionId !== undefined) {
          setSelectedCollectionId(props.initialCollectionId);
        }
      } else if (props.initialTarget === "followed") {
        setTargetMode("followed");
      } else {
        setTargetMode("auto");
      }
    }
  });

  const currentCollectionName = (): string => {
    if (isCreatingNewCol()) {
      return newCollectionName().trim() || "New Collection";
    }
    const col = collections().find((c) => c.id === selectedCollectionId());
    return col?.name || props.collectionName || "Favorites";
  };

  // Live validation memo
  const parsed = createMemo(() => {
    const text = rawText().trim();
    if (!text) {
      return validateAndParseImport("", {
        defaultTarget: targetMode() === "collection" ? "collection" : "followed",
        targetCollectionName: currentCollectionName(),
      });
    }
    return validateAndParseImport(text, {
      defaultTarget: targetMode() === "collection" ? "collection" : "followed",
      targetCollectionName: currentCollectionName(),
    });
  });

  const totalDetectedCount = (): number => {
    const p = parsed();
    const mode = targetMode();
    if (mode === "followed") {
      return p.stats.followedCount + p.stats.collectionItemsCount;
    }
    if (mode === "collection") {
      return p.stats.followedCount + p.stats.collectionItemsCount;
    }
    return p.stats.followedCount + p.stats.collectionItemsCount;
  };

  const handlePaste = async (): Promise<void> => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setRawText(text.trim());
        }
      }
    } catch (err) {
      const msg = errorMessage(err);
      showBanner(t("library.exportCopyError", { msg }));
    }
  };

  const handleExecuteImport = async (): Promise<void> => {
    const p = parsed();
    if (!p.valid || importing()) return;

    setImporting(true);
    try {
      const mode = targetMode();
      const result = await executeImport(p, {
        targetMode: mode,
        targetCollectionId: mode === "collection" && !isCreatingNewCol() ? selectedCollectionId() : undefined,
        newCollectionName: mode === "collection" && isCreatingNewCol() ? newCollectionName().trim() : undefined,
      });

      const count = result.totalImported;
      showBanner(
        t("library.importSuccessBanner", {
          count,
          noun: count === 1 ? t("library.nounItem") : t("library.nounItems"),
        }),
      );

      props.onImported?.();
      props.onClose();
    } catch (err) {
      const msg = errorMessage(err);
      showBanner(t("library.importErrorBanner", { msg }));
    } finally {
      setImporting(false);
    }
  };

  const targetModeOptions: SelectOption[] = [
    { value: "auto", label: t("library.importTargetAuto") },
    { value: "followed", label: t("library.importTargetFollowed") },
    { value: "collection", label: t("library.importTargetCollection") },
  ];

  const collectionOptions = (): SelectOption[] => {
    const opts: SelectOption[] = collections().map((c) => ({
      value: String(c.id),
      label: c.name + (c.is_default ? " (Default)" : ""),
    }));
    opts.push({ value: "new", label: t("library.importTargetNewCollection") });
    return opts;
  };

  return (
    <Modal
      open={props.open()}
      backdropId="ds-import-modal-overlay"
      width={560}
      onClose={props.onClose}
      title={
        <span class="ds-icon-text">
          <Icon name="box-arrow-in-down" color="var(--sys-link, #0078d4)" />
          <span>{t("library.importModalTitle")}</span>
        </span>
      }
      body={
        <div class="ds-form-stack ds-import-form">
          <div class="ds-import-actions-bar">
            <div class="ds-export-field" style="flex: 1;">
              <label class="ds-form-label-sm">{t("library.importTargetLabel")}</label>
              <DsSelect
                value={targetMode()}
                options={targetModeOptions}
                disabled={importing()}
                onChange={(val) => {
                  setTargetMode(val as "auto" | "followed" | "collection");
                  if (val !== "collection") setIsCreatingNewCol(false);
                }}
              />
            </div>
            <Show when={targetMode() === "collection"}>
              <div class="ds-export-field" style="flex: 1;">
                <label class="ds-form-label-sm">{t("library.importTargetCollectionSelect")}</label>
                <DsSelect
                  value={isCreatingNewCol() ? "new" : String(selectedCollectionId())}
                  options={collectionOptions()}
                  disabled={importing()}
                  onChange={(val) => {
                    if (val === "new") {
                      setIsCreatingNewCol(true);
                    } else {
                      setIsCreatingNewCol(false);
                      setSelectedCollectionId(Number(val));
                    }
                  }}
                />
              </div>
            </Show>
            <div style="align-self: flex-end;">
              <IconButton
                icon={<ClipboardIcon />}
                text={t("library.importPasteButton")}
                className="ds-btn-sm"
                disabled={importing()}
                onClick={() => void handlePaste()}
              />
            </div>
          </div>

          <Show when={targetMode() === "collection" && isCreatingNewCol()}>
            <div class="ds-export-field">
              <label class="ds-form-label-sm">{t("library.importNewCollectionNameLabel")}</label>
              <InputField
                autofocus={true}
                placeholder={t("library.createCollectionNamePlaceholder")}
                value={newCollectionName()}
                onInput={(val) => setNewCollectionName(val)}
              />
            </div>
          </Show>

          <div class="ds-export-preview-wrap">
            <textarea
              class="input-field ds-import-textarea"
              rows={8}
              value={rawText()}
              onInput={(ev) => setRawText(ev.currentTarget.value)}
              placeholder={t("library.importInputPlaceholder")}
              spellcheck={false}
              disabled={importing()}
            />
          </div>

          {/* Validation & Live Feedback Summary */}
          <div class="ds-import-feedback">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
              <Show
                when={parsed().detectedFormat !== "none"}
                fallback={<span class="ds-muted">{t("library.importValidationEmpty")}</span>}
              >
                <span class="ds-import-badge ds-import-badge--success">
                  <CheckIcon />
                  {t("library.importDetectedBadge", {
                    format: parsed().detectedFormat === "json" ? "JSON" : "Dynasty Scans URLs",
                  })}
                </span>
                <span style="font-weight: 600;">
                  {t("library.importValidationValid", { count: totalDetectedCount() })}
                </span>
              </Show>
            </div>

            {/* Warnings list if any */}
            <Show when={parsed().warnings.length > 0}>
              <div style="color: var(--sys-warning-text, #b45309); margin-top: 4px;">
                <For each={parsed().warnings}>
                  {(w) => (
                    <div style="display: flex; align-items: center; gap: 4px;">
                      <WarningIcon />
                      <span>{w}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* Errors list if any */}
            <Show when={parsed().errors.length > 0 && rawText().trim().length > 0}>
              <div style="color: var(--sys-danger-text, #d13438); margin-top: 4px;">
                <For each={parsed().errors}>
                  {(e) => <div>❌ {e}</div>}
                </For>
              </div>
            </Show>
          </div>
        </div>
      }
      footer={
        <div class="ds-modal-footer-actions ds-export-footer">
          <button
            type="button"
            class="win-button ds-btn-sm ds-modal-cancel"
            disabled={importing()}
            onClick={props.onClose}
          >
            {t("common.cancel")}
          </button>
          <IconButton
            icon={<Icon name="box-arrow-in-down" />}
            text={importing() ? t("library.importingButton") : t("library.importConfirmButton")}
            className="primary ds-modal-submit"
            disabled={importing() || !parsed().valid || (targetMode() === "collection" && isCreatingNewCol() && !newCollectionName().trim())}
            onClick={() => void handleExecuteImport()}
          />
        </div>
      }
    />
  );
}
