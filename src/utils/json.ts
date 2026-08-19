/**
 * JSON parsing helper: surfaces parse failures explicitly instead of letting
 * them escape as opaque TypeError messages mid-pipeline.
 */

/** Parses JSON text; logs and returns null on failure (never throws). */
export function tryParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.error("Failed to parse JSON payload:", err);
    return null;
  }
}