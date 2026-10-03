import type {
  ContentProviderAdapter,
  ContentProviderId,
} from "./types";
import { dynastyProvider } from "./dynasty.provider";
import { mangadexProvider } from "./mangadex.provider";
import { localProvider } from "./local.provider";
import { activeProvider } from "../stores/provider";

const PROVIDER_MAP: Record<ContentProviderId, ContentProviderAdapter> = {
  dynasty: dynastyProvider,
  mangadex: mangadexProvider,
  local: localProvider,
};

/**
 * Returns the ContentProviderAdapter corresponding to the given provider ID.
 */
export function getProvider(id: ContentProviderId): ContentProviderAdapter {
  return PROVIDER_MAP[id] ?? dynastyProvider;
}

/**
 * Returns the ContentProviderAdapter appropriate for a given permalink.
 * Completely deterministic and synchronous based on prefix — eliminates async races.
 */
export function getProviderForPermalink(permalink: string): ContentProviderAdapter {
  if (typeof permalink !== "string" || !permalink) {
    return dynastyProvider;
  }
  if (permalink.startsWith("mdx:")) {
    return mangadexProvider;
  }
  if (permalink.startsWith("local:")) {
    return localProvider;
  }
  return dynastyProvider;
}

/**
 * Returns the adapter for the currently active UI browsing provider.
 */
export function getActiveProviderAdapter(): ContentProviderAdapter {
  return getProvider(activeProvider());
}

/**
 * Canonical URL resolver for any content item across all providers.
 * Dynasty -> dynasty-scans.com
 * MangaDex -> mangadex.org
 * Local -> ""
 */
export function canonicalUrl(path: string, permalink: string): string {
  if (!permalink) return "";
  return getProviderForPermalink(permalink).canonicalUrl(path, permalink);
}

/**
 * Extracts the clean entity ID (e.g. bare UUID for MangaDex, path slug for local, slug for Dynasty).
 */
export function extractEntityId(permalink: string): string {
  if (!permalink) return "";
  return getProviderForPermalink(permalink).extractEntityId(permalink);
}

/**
 * Validates if candidate is a safe, valid permalink for any known provider.
 */
export function isValidPermalink(candidate: unknown): candidate is string {
  if (typeof candidate !== "string") return false;
  return getProviderForPermalink(candidate).isValidPermalink(candidate);
}

/**
 * Clears cached chapter files and database entries across all matching providers.
 * Polymorphic: partitions permalinks by provider so each provider only touches its own DB.
 */
export async function clearCachedChapters(chapterPermalinks: string[]): Promise<void> {
  if (chapterPermalinks.length === 0) return;
  const byProvider = new Map<ContentProviderAdapter, string[]>();

  for (const p of chapterPermalinks) {
    const adapter = getProviderForPermalink(p);
    const list = byProvider.get(adapter) ?? [];
    list.push(p);
    byProvider.set(adapter, list);
  }

  await Promise.all(
    Array.from(byProvider.entries()).map(([adapter, perms]) =>
      adapter.clearCachedChapters(perms),
    ),
  );
}
