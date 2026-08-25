import { query } from "./client";

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

/**
 * Runs a count query then a paginated rows query, returning rows and page metadata.
 */
export async function queryPaged<T extends object>(
  countSql: string,
  rowsSqlWithOffsetLimit: string,
  page: number,
  pageSize: number,
  params: unknown[] = [],
): Promise<{ rows: T[]; totalPages: number; currentPage: number; totalCount: number }> {
  const countRows = await query<{ count: number }>(countSql, params);
  const totalCount = countRows[0]?.count ?? 0;
  const { totalPages, currentPage, offset } = paginate(totalCount, page, pageSize);
  const rows = await query<T>(rowsSqlWithOffsetLimit, [...params, pageSize, offset]);
  return { rows, totalPages, currentPage, totalCount };
}

/** Builds a `?,?,?` placeholder clause for an IN (...) of `n` items. */
export function inClause(n: number): string {
  return new Array(Math.max(0, n)).fill("?").join(",");
}