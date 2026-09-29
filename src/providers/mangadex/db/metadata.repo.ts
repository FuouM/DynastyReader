/**
 * MangaDex SQLite Metadata Cache Repository
 * Caches feed pages, head checks, and directory results in mangadex.db.
 */

import { execute, query } from "./client";
import { createMetadataRepo } from "../../../db/metadata.repo";

const mdxRepo = createMetadataRepo({ query, execute });
export const getCachedMdxMetadata = mdxRepo.getCached;
export const setCachedMdxMetadata = mdxRepo.setCached;
export const touchCachedMdxMetadata = mdxRepo.touchCached;

