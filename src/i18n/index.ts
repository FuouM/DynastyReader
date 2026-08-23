import { createSignal } from "solid-js";
import { en, type Dict } from "./en";
import {
  type Locale,
  type LocaleInfo,
  type NestedKeyOf,
  type TranslationParams,
  SUPPORTED_LOCALES,
} from "./types";

export type { Locale, LocaleInfo, TranslationParams };
export type TranslationKey = NestedKeyOf<Dict>;
export { SUPPORTED_LOCALES };

const STORAGE_KEY = "ds-locale";

const dictionaries: Record<Locale, Dict> = {
  en,
};

function readPersistedLocale(): Locale {
  if (typeof localStorage === "undefined") return "en";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw in dictionaries) {
      return raw as Locale;
    }
  } catch (err) {
    console.error("[i18n] Failed to read persisted locale:", err);
  }
  return "en";
}

const [localeSignal, setLocaleSignal] = createSignal<Locale>(readPersistedLocale());

export const locale = localeSignal;

export function setLocale(loc: Locale): void {
  if (!(loc in dictionaries)) {
    console.warn(`[i18n] Unsupported locale "${loc}", falling back to "en".`);
    loc = "en";
  }
  setLocaleSignal(loc);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, loc);
    }
  } catch (err) {
    console.error("[i18n] Failed to persist locale:", err);
  }
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

/**
 * Type-safe translation lookup function.
 * Automatically tracks the current locale signal in Solid reactive contexts.
 */
export function t(path: TranslationKey, params?: TranslationParams): string {
  const currentLocale = localeSignal();
  const activeDict = dictionaries[currentLocale] ?? en;

  const parts = (path as string).split(".");
  let cur: unknown = activeDict;

  for (const part of parts) {
    if (cur && typeof cur === "object" && part in cur) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      // Fallback to English dictionary if key missing in active locale
      let fallbackCur: unknown = en;
      for (const fallbackPart of parts) {
        if (fallbackCur && typeof fallbackCur === "object" && fallbackPart in fallbackCur) {
          fallbackCur = (fallbackCur as Record<string, unknown>)[fallbackPart];
        } else {
          fallbackCur = undefined;
          break;
        }
      }
      if (typeof fallbackCur === "string") {
        return interpolate(fallbackCur, params);
      }
      console.warn(`[i18n] Missing translation for key: "${path}"`);
      return String(path);
    }
  }

  if (typeof cur === "string") {
    return interpolate(cur, params);
  }

  console.warn(`[i18n] Translation path does not resolve to a string: "${path}"`);
  return String(path);
}

export default t;
