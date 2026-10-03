/**
 * MangaDex SQLite Metadata Cache Repository
 * Caches feed pages, head checks, and directory results in mangadex.db.
 */

import { execute, query } from "./client";
import { createMetadataRepo } from "../../../db/metadata.repo";

const mdxRepo = createMetadataRepo({ query, execute });
export const getCachedMdxMetadata = mdxRepo.getCached;
export const getBatchCachedMdxMetadata = mdxRepo.getBatchCached;
export const setCachedMdxMetadata = mdxRepo.setCached;
export const touchCachedMdxMetadata = mdxRepo.touchCached;
export const deleteCachedMdxMetadata = mdxRepo.deleteCached;
