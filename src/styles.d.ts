/**
 * Ambient module declaration for `.css` imports.
 *
 * Vite handles the CSS imports in `main.ts` (base + per-view stylesheets);
 * this declaration lets `tsc --noEmit` resolve them.
 */
declare module "*.css" {
  const cssText: string;
  export default cssText;
}
