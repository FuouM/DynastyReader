export type Locale = "en";

export interface LocaleInfo {
  code: Locale;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_LOCALES: LocaleInfo[] = [
  { code: "en", label: "English", nativeLabel: "English" },
];

/** Recursive leaf keys helper for dot-separated paths */
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export type NestedKeyOf<T, Depth extends number = 5> = [Depth] extends [never]
  ? never
  : T extends object
    ? {
        [K in keyof T & (string | number)]: T[K] extends object
          ? `${K}` | `${K}.${NestedKeyOf<T[K], Prev[Depth]>}`
          : `${K}`;
      }[keyof T & (string | number)]
    : "";

export type TranslationParams = Record<string, string | number | boolean | null | undefined>;
