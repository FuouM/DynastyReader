import { log } from "../utils/log";

/** Parse a value persisted via JSON.stringify-or-raw string (legacy quote-wrapped). */
export function parsePersistedString(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    if (parsed != null) return String(parsed);
  } catch (err) {
    log.debug("persisted", "deserialize fallback, raw:", raw, err);
  }
  return raw.replace(/^["']|["']$/g, "").trim() || fallback;
}

/** Parse a persisted string then normalize to lowercase id form (a-z0-9-). */
export function parsePersistedId(raw: string, fallback: string): string {
  return parsePersistedString(raw, fallback).trim().toLowerCase();
}
