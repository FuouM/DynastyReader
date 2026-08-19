/**
 * Small action-bar / empty-state builders shared across views.
 * Top-bar actions are rendered inside `#ds-actions` by `setActions`; these
 * helpers only build individual buttons/rows.
 */

/**
 * Builds a compact top-bar action button. `html` is trusted static markup
 * (icon + label); `title` is the native tooltip.
 */
export function createTopbarAction(
  html: string,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "win-button ds-btn-compact";
  btn.title = title;
  btn.innerHTML = html;
  btn.addEventListener("click", onClick);
  return btn;
}

/**
 * Builds the standard "Back + Refresh" top-bar pair used by the Library
 * sub-views (Cache Manager, Series Blacklist, Collection detail).
 */
export function createBackRefreshActions(
  backLabel: string,
  onBack: () => void,
  onRefresh: () => void,
): [HTMLButtonElement, HTMLButtonElement] {
  return [
    createTopbarAction(`<i class="bi bi-arrow-left"></i> ${backLabel}`, "Back", onBack),
    createTopbarAction('<i class="bi bi-arrow-clockwise"></i> Refresh', "Refresh", onRefresh),
  ];
}

/**
 * Renders a centered empty-state block. `contentHtml` must be trusted static
 * markup (the app's own strings — no interpolated user/source data).
 */
export function renderEmptyState(contentHtml: string, iconClass?: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "ds-empty-state";
  const icon = iconClass ? `<i class="${iconClass}" aria-hidden="true"></i>` : "";
  el.innerHTML = `${icon}${contentHtml}`;
  return el;
}