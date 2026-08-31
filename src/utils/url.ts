import { SITE_ROOT } from "../constants";

/** Absolute URL from a possibly-relative site path (e.g. `/system/.../01.webp`). */
export function absUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  return SITE_ROOT + u;
}

/** Constructs a full Dynasty Scans URL for the given path and permalink. */
export function dynastyUrl(path: string, permalink: string): string {
  return `${SITE_ROOT}/${path}/${permalink}`;
}
