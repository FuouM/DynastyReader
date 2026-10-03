import { describe, expect, it } from "vitest";
import { buildDynastySearchUrl } from "../../src/api/search";

describe("api/search - buildDynastySearchUrl", () => {
  it("builds query URL without setting q for pure tag searches", () => {
    const url = buildDynastySearchUrl({
      withTags: ["Yuri", "Romance"],
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("q")).toBeNull();
    expect(parsed.searchParams.getAll("with[]")).toEqual(["Yuri", "Romance"]);
  });

  it("includes q when a query string is provided alongside tags", () => {
    const url = buildDynastySearchUrl({
      q: "citrus",
      withTags: ["Drama"],
      withoutTags: ["Tragedy"],
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("q")).toBe("citrus");
    expect(parsed.searchParams.getAll("with[]")).toEqual(["Drama"]);
    expect(parsed.searchParams.getAll("without[]")).toEqual(["tragedy"]);
  });

  it("handles classes and pagination accurately", () => {
    const url = buildDynastySearchUrl({
      q: "bloom",
      classes: ["Series", "Chapter"],
      page: 3,
      sort: "name",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("q")).toBe("bloom");
    expect(parsed.searchParams.getAll("classes[]")).toEqual(["Series", "Chapter"]);
    expect(parsed.searchParams.get("page")).toBe("3");
    expect(parsed.searchParams.get("sort")).toBe("name");
  });

  it("omits page parameter when page is 1", () => {
    const url = buildDynastySearchUrl({
      q: "bloom",
      page: 1,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("page")).toBeNull();
  });
});
