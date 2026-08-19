/**
 * Top-bar controls: plugin title, transient banner, and the actions button
 * host. Extracted from the old `state.ts` barrel so the router stays focused
 * on routing and views on rendering.
 */

/** Sets the plugin top-bar title. */
export function setTitle(text: string): void {
  const el = document.getElementById("ds-title");
  if (el) el.textContent = text;
}

let bannerTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Shows a transient error/info banner in the top navigation bar. Pass `null` to hide.
 */
export function setBanner(message: string | null): void {
  const el = document.getElementById("ds-banner");
  if (!el) return;
  if (bannerTimer !== null) {
    clearTimeout(bannerTimer);
    bannerTimer = null;
  }
  if (!message) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.textContent = message;
  el.style.display = "inline-flex";
  bannerTimer = setTimeout(() => {
    el.style.display = "none";
    el.textContent = "";
    bannerTimer = null;
  }, 4000);
}

/** Hides the transient banner (called by the router before re-rendering). */
export function clearBanner(): void {
  setBanner(null);
}

/** Replaces the top-bar action buttons (follow, bookmark, cache, …). */
export function setActions(build: (host: HTMLElement) => void): void {
  const host = document.getElementById("ds-actions");
  if (!host) return;
  host.innerHTML = "";
  build(host);
}

/** Empties the top-bar action host (called by the router before re-rendering). */
export function clearActions(): void {
  const host = document.getElementById("ds-actions");
  if (host) host.innerHTML = "";
}