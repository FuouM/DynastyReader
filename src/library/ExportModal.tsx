import {
  createEffect,
  createSignal,
  onCleanup,
  Show,
  type Accessor,
} from "solid-js";
import { t } from "../i18n";
import { showBanner } from "../stores";
import { errorMessage } from "../utils/errors";
import { Modal } from "../components/Modal";
import { IconButton, DsSelect, type SelectOption } from "../components/Button";
import { Icon, CheckIcon, ClipboardIcon } from "../components/Icon";
import {
  fetchAndFormatExport,
  type ExportScope,
  type ExportFormat,
  type ExportCounts,
} from "../db";

export interface ExportModalProps {
  open: Accessor<boolean>;
  onClose: () => void;
  initialScope?: ExportScope;
  initialCollectionId?: number;
  collectionName?: string;
}

function formatByteSize(charLength: number): string {
  if (charLength < 1024) return `${charLength} B`;
  if (charLength < 1024 * 1024) return `${(charLength / 1024).toFixed(1)} KB`;
  return `${(charLength / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExportModal(props: ExportModalProps) {
  const [scope, setScope] = createSignal<ExportScope>(props.initialScope ?? "followed");
  const [format, setFormat] = createSignal<ExportFormat>("json-pretty");
  const [exportedText, setExportedText] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
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

  // Reset scope to initial when opening
  createEffect(() => {
    if (props.open()) {
      setScope(props.initialScope ?? "followed");
      setCopied(false);
    }
  });

  // Re-fetch and re-format export text whenever open, scope, or format changes
  createEffect(() => {
    if (!props.open()) return;

    const currentScope = scope();
    const currentFormat = format();
    const token = ++fetchToken;

    setLoading(true);
    void fetchAndFormatExport({
      scope: currentScope,
      collectionId: currentScope === "collection" ? props.initialCollectionId : undefined,
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
    if (s === "collections" || s === "collection") return c.collectionItems;
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

  const handleSelectAll = (): void => {
    if (textareaRef) {
      textareaRef.focus();
      textareaRef.select();
    }
  };

  const scopeOptions = (): SelectOption[] => {
    const opts: SelectOption[] = [];
    if (props.initialCollectionId !== undefined) {
      const label = props.collectionName
        ? `${t("library.exportScopeCurrentCollection")} (${props.collectionName})`
        : t("library.exportScopeCurrentCollection");
      opts.push({ value: "collection", label });
    }
    opts.push(
      { value: "followed", label: t("library.exportScopeFollowed") },
      { value: "collections", label: t("library.exportScopeCollections") },
      { value: "all", label: t("library.exportScopeAll") },
    );
    return opts;
  };

  const formatOptions: SelectOption[] = [
    { value: "json-pretty", label: t("library.exportFormatJsonPretty") },
    { value: "json-compact", label: t("library.exportFormatJsonCompact") },
    { value: "text", label: t("library.exportFormatText") },
    { value: "markdown", label: t("library.exportFormatMarkdown") },
    { value: "urls", label: t("library.exportFormatUrls") },
  ];

  return (
    <Modal
      open={props.open()}
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
                value={scope()}
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
                      size: formatByteSize(exportedText().length),
                    })}
                  </span>
                </Show>
              </Show>
            </span>
            <button
              type="button"
              class="win-button ds-btn-sm"
              disabled={loading() || !exportedText()}
              onClick={handleSelectAll}
            >
              {t("common.selectAll") ?? "Select All"}
            </button>
          </div>

          <div class="ds-export-preview-wrap">
            <textarea
              ref={textareaRef}
              class="input-field ds-export-textarea"
              readOnly={true}
              rows={12}
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
