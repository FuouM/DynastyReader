/**
 * Compatibility shim — historic import path `src/state.ts`.
 *
 * Single source of truth lives in `src/stores/index.ts` (TAB_ID, SITE_ROOT,
 * DB_NAME, PAGES_PREFIX, COVERS_PREFIX, isOnline, absUrl, router/topbar/etc.).
 * This file re-exports that surface to avoid drift between two barrels and
 * preserves the pre-Solid import path for plugins / legacy call sites.
 * Prefer `import { ... } from "./stores"` in new code; this barrel will be
 * removed once external plugins migrate.
 */
export * from "./stores";