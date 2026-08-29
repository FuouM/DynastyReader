/**
 * Centralized log taxonomy — enforces consistent `[dynasty-reader/...]` prefixes.
 * Use `log.debug/warn/error(ns, ...args)` instead of raw console.*.
 * Keeps grep-able labels and avoids bare product-name drift.
 */

type LogFn = (ns: string, ...args: unknown[]) => void;

function prefix(ns: string): string {
  // Always bracketed canonical prefix: [dynasty-reader/ns]
  return `[dynasty-reader/${ns}]`;
}

export const log: { debug: LogFn; warn: LogFn; error: LogFn } = {
  debug(ns, ...args) {
    console.debug(prefix(ns), ...args);
  },
  warn(ns, ...args) {
    console.warn(prefix(ns), ...args);
  },
  error(ns, ...args) {
    console.error(prefix(ns), ...args);
  },
};
