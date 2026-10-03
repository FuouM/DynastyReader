import { describe, expect, it } from "vitest";
import { paginate, inClause } from "../../src/db/paging";

describe("db/paging - paginate math", () => {
  it("computes standard pagination offsets", () => {
    // 25 items, page 1, 10 per page
    expect(paginate(25, 1, 10)).toEqual({
      totalPages: 3,
      currentPage: 1,
      offset: 0,
    });

    // page 2
    expect(paginate(25, 2, 10)).toEqual({
      totalPages: 3,
      currentPage: 2,
      offset: 10,
    });

    // page 3
    expect(paginate(25, 3, 10)).toEqual({
      totalPages: 3,
      currentPage: 3,
      offset: 20,
    });
  });

  it("clamps currentPage within 1 and totalPages", () => {
    // Requesting page 0 clamps to 1
    expect(paginate(50, 0, 10)).toEqual({
      totalPages: 5,
      currentPage: 1,
      offset: 0,
    });

    // Requesting page beyond totalPages clamps to totalPages
    expect(paginate(50, 999, 10)).toEqual({
      totalPages: 5,
      currentPage: 5,
      offset: 40,
    });
  });

  it("handles totalCount = 0 cleanly without 0 totalPages", () => {
    expect(paginate(0, 1, 10)).toEqual({
      totalPages: 1,
      currentPage: 1,
      offset: 0,
    });
  });
});

describe("db/paging - inClause generator", () => {
  it("generates comma-separated question mark clauses", () => {
    expect(inClause(1)).toBe("?");
    expect(inClause(3)).toBe("?,?,?");
    expect(inClause(5)).toBe("?,?,?,?,?");
  });

  it("returns 'NULL' for 0 or negative items to avoid SQL syntax error IN ()", () => {
    expect(inClause(0)).toBe("NULL");
    expect(inClause(-1)).toBe("NULL");
  });
});
