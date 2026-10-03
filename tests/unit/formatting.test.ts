import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatBytes,
  formatSpeed,
  formatEta,
  slugify,
  decodeEntities,
} from "../../src/utils/formatting";

describe("utils/formatting - date formatting", () => {
  it("formats unix timestamps as YYYY-MM-DD", () => {
    // 2026-05-15 12:00:00 UTC
    const date = new Date("2026-05-15T12:00:00Z").getTime();
    expect(formatDate(date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("handles empty or 0 timestamps", () => {
    expect(formatDate(0)).toBe("");
    expect(formatDateTime(0)).toBe("Never");
    expect(formatDateTime(null)).toBe("Never");
    expect(formatDateTime(undefined)).toBe("Never");
  });
});

describe("utils/formatting - slugify", () => {
  it("converts mixed strings into URL-safe slugs", () => {
    expect(slugify("Bloom Into You")).toBe("bloom_into_you");
    expect(slugify("  Hello   World!  ")).toBe("hello_world");
    expect(slugify("Special-Chars & Symbols #42")).toBe("special_chars_symbols_42");
    expect(slugify("___leading_and_trailing___")).toBe("leading_and_trailing");
  });
});

describe("utils/formatting - formatBytes", () => {
  it("formats byte values cleanly across orders of magnitude", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512.00 B");
    expect(formatBytes(1024)).toBe("1.00 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
  });

  it("supports custom decimal precision", () => {
    expect(formatBytes(1536, "", 1)).toBe("1.5 KB");
    expect(formatBytes(1536, "", 0)).toBe("2 KB");
  });

  it("returns fallback for invalid or negative byte counts", () => {
    expect(formatBytes(null, "N/A")).toBe("N/A");
    expect(formatBytes(undefined, "unknown")).toBe("unknown");
    expect(formatBytes(NaN, "-")).toBe("-");
    expect(formatBytes(-100, "None")).toBe("None");
  });
});

describe("utils/formatting - formatSpeed and formatEta", () => {
  it("formats speeds with /s suffix", () => {
    expect(formatSpeed(1024 * 1024)).toBe("1.00 MB/s");
    expect(formatSpeed(0)).toBe("");
    expect(formatSpeed(-5)).toBe("");
  });

  it("formats ETAs in readable units", () => {
    expect(formatEta(30)).toBe("~30s");
    expect(formatEta(90)).toBe("~1m 30s");
    expect(formatEta(3665)).toBe("~1h 1m");
    expect(formatEta(0)).toBe("");
    expect(formatEta(100_000)).toBe(""); // Over 24 hours
  });
});

describe("utils/formatting - decodeEntities", () => {
  it("decodes HTML entities in titles and text", () => {
    expect(decodeEntities("Bloom &amp; You")).toBe("Bloom & You");
    expect(decodeEntities("&quot;Citrus&#39;")).toBe("\"Citrus'");
    expect(decodeEntities("&lt;tag&gt;")).toBe("<tag>");
    expect(decodeEntities("No entities")).toBe("No entities");
  });
});
