/**
 * Shared pagination math for the paged DB queries.
 * Returns the clamped current page, total pages, and the SQL OFFSET.
 */
export function paginate(
  totalCount: number,
  page: number,
  pageSize: number,
): { totalPages: number; currentPage: number; offset: number } {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const offset = (currentPage - 1) * pageSize;
  return { totalPages, currentPage, offset };
}

/** Builds a `?,?,?` placeholder clause for an IN (...) of `n` items. */
export function inClause(n: number): string {
  return new Array(Math.max(0, n)).fill("?").join(",");
}