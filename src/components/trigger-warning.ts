import { safeHtml } from "../state";
import { openModal } from "./modal";

/**
 * Renders an accessible, WinForms-style Content/Trigger Warning confirmation modal
 * for items containing blacklisted tags in "Trigger Warning" mode.
 */
export function showBlacklistWarningModal(
  title: string,
  matchedTags: string[],
  onProceed: () => void,
): void {
  const tagsListHtml = matchedTags
    .map(
      (t) =>
        `<span class="tag-pill" style="background:var(--ds-warn-bg);border:1px solid var(--ds-warn-border);color:var(--ds-warn-text);font-weight:600;font-size:11px;padding:2px 7px;"><i class="bi bi-shield-slash-fill"></i> ${safeHtml(t)}</span>`,
    )
    .join("");

  const { modal, close } = openModal({
    title:
      '<span style="color:#d9534f;"><i class="bi bi-exclamation-triangle-fill"></i> Content Warning</span>',
    width: 380,
    body: `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="font-size:12px;font-weight:600;color:var(--sys-window-text,#111);word-break:break-word;">
          ${safeHtml(title)}
        </div>
        <div style="font-size:11px;color:var(--sys-text-muted,#555);line-height:1.4;">
          This item matches tags or series on your blacklist:
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;max-height:90px;overflow-y:auto;padding:2px 0;">
          ${tagsListHtml}
        </div>
        <div class="ds-muted" style="font-size:11px;color:#777;margin-top:2px;">
          Do you still want to proceed and open it?
        </div>
      </div>
    `,
    footer: `
      <div style="display:flex;justify-content:flex-end;gap:8px;width:100%;">
        <button type="button" class="win-button ds-modal-cancel" style="min-width:70px;">Cancel</button>
        <button type="button" class="win-button primary ds-modal-proceed" style="min-width:85px;background:#dc3545;border-color:#b02a37;color:#fff;">
          <i class="bi bi-box-arrow-in-right"></i> Proceed
        </button>
      </div>
    `,
  });

  const cancelBtn = modal.querySelector(".ds-modal-cancel");
  const proceedBtn = modal.querySelector(".ds-modal-proceed");
  cancelBtn?.addEventListener("click", close);
  proceedBtn?.addEventListener("click", () => {
    close();
    onProceed();
  });
}