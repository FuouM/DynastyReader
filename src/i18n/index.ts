import { persistedSignal } from "../lib/persisted-signal";
import { log } from "../utils/log";
import { en, type Dict } from "./en";
import {
  type Locale,
  type LocaleInfo,
  type NestedKeyOf,
  type TranslationParams,
  SUPPORTED_LOCALES,
} from "./types";

export type { Locale, LocaleInfo, TranslationParams };
/** Plural families (`key_one`/`key_other`/…) are also addressable by their base path — t() resolves the CLDR category at runtime. */
type StripPluralSuffix<K extends string> =
  K extends `${infer Base}_${"one" | "other" | "few" | "many" | "zero" | "two"}` ? Base : K;
export type TranslationKey = StripPluralSuffix<NestedKeyOf<Dict>>;
export { SUPPORTED_LOCALES };

const dictionaries: Record<Locale, Dict> = {
  en,
};

const [localeSignal, setLocaleRaw] = persistedSignal<Locale>("en", {
  name: "ds-locale",
  deserialize: (v) => (v in dictionaries) ? v as Locale : "en",
});

export const locale = localeSignal;

export function setLocale(loc: Locale): void {
  if (!(loc in dictionaries)) {
    log.warn("i18n", `Unsupported locale "${loc}", falling back to "en".`);
    loc = "en";
  }
  setLocaleRaw(loc);
}

/** Interpolates `{{key}}` and `{key}` place markers in a template string. */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (match, p1, p2) => {
    const key = p1 || p2;
    if (key in params) {
      const val = params[key];
      return val === null || val === undefined ? "" : String(val);
    }
    return match;
  });
}

/** Resolves a dot-separated path against a dictionary; undefined when absent. */
function resolvePath(dict: unknown, path: string): unknown {
  let cur: unknown = dict;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in cur) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Intl.PluralRules instances are expensive; cache one per locale. */
const pluralRulesCache: Partial<Record<Locale, Intl.PluralRules>> = {};

/**
 * When `params.count` is a number, selects the CLDR plural form by resolving
 * `<path>_<category>` (e.g. `key_one` / `key_other`) when such a key exists in
 * the active or fallback dictionary. Otherwise the base path is used.
 */
function resolvePluralPath(locale: Locale, path: string, params?: TranslationParams): string {
  if (typeof params?.count !== "number") return path;
  const rules = (pluralRulesCache[locale] ??= new Intl.PluralRules(locale));
  const pluralPath = `${path}_${rules.select(params.count)}`;
  const activeDict = dictionaries[locale] ?? en;
  if (typeof resolvePath(activeDict, pluralPath) === "string") return pluralPath;
  if (typeof resolvePath(en, pluralPath) === "string") return pluralPath;
  return path;
}

/**
 * Type-safe translation lookup function.
 * Automatically tracks the current locale signal in Solid reactive contexts.
 */
export function t(path: TranslationKey, params?: TranslationParams): string {
  const currentLocale = localeSignal();
  const activeDict = dictionaries[currentLocale] ?? en;
  const resolvedPath = resolvePluralPath(currentLocale, path as string, params);

  const cur = resolvePath(activeDict, resolvedPath);
  if (typeof cur === "string") {
    return interpolate(cur, params);
  }

  // Fallback to English dictionary if key missing in active locale
  const fallbackCur = resolvePath(en, resolvedPath);
  if (typeof fallbackCur === "string") {
    return interpolate(fallbackCur, params);
  }

  if (cur === undefined && fallbackCur === undefined) {
    log.warn("i18n", `Missing translation for key: "${resolvedPath}"`);
  } else {
    log.warn("i18n", `Translation path does not resolve to a string: "${resolvedPath}"`);
  }
  return String(path);
}

export default t;
