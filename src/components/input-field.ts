let clearButtonsDelegated = false;

/**
 * Installs one document-level delegated handler for `.input-clear-btn` buttons.
 * Clicks on a clear button empty its `.input-field` sibling; `input`/`change`
 * events keep the `.has-value` (button-visible) state in sync. Idempotent —
 * call once from the app bootstrap.
 */
export function setupInputClearButtons(): void {
  if (clearButtonsDelegated) return;
  clearButtonsDelegated = true;

  document.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    const btn = target?.closest?.(".input-clear-btn") as HTMLButtonElement | null;
    if (!btn) return;
    const wrapper = btn.closest<HTMLElement>(".input-wrapper");
    const input = wrapper?.querySelector<HTMLInputElement>(".input-field");
    if (!input) return;
    input.value = "";
    wrapper?.classList.remove("has-value");
    input.focus();
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  document.addEventListener("input", syncClearVisibility);
  document.addEventListener("change", syncClearVisibility);
}

function syncClearVisibility(ev: Event): void {
  const target = ev.target as HTMLElement | null;
  if (!target?.classList?.contains("has-clear")) return;
  const wrapper = target.closest<HTMLElement>(".input-wrapper");
  if (!wrapper) return;
  wrapper.classList.toggle("has-value", (target as HTMLInputElement).value.length > 0);
}