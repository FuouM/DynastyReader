import { createResource, createSignal, onCleanup, onMount, type Accessor } from "solid-js";
import { query as dynastyQuery } from "../db/client";
import { query as mangadexQuery } from "../providers/mangadex/db/client";
import { initMangaDexDb } from "../providers/mangadex/db/schema";
import { activeProvider } from "../stores/provider";
import { dbReady } from "../stores/router";
import {
  onFollowedChanged,
  onBookmarksChanged,
  onHistoryChanged,
} from "../db/library-notifiers";
import { onCollectionsChanged } from "../db/collections.repo";
import { onLocalChanged } from "../db/local.repo";

export type LibraryTabId = "followed" | "collections" | "bookmarks" | "history" | "local";

export type LibraryCounts = Partial<Record<LibraryTabId, number>>;

async function countDynastyTable(table: string): Promise<number> {
  try {
    const rows = await dynastyQuery<{ count?: number; c?: number }>(
      `SELECT COUNT(*) as count FROM ${table}`,
    );
    return Number(rows[0]?.count ?? rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

async function countMdxTable(table: string): Promise<number> {
  try {
    const rows = await mangadexQuery<{ count?: number; c?: number }>(
      `SELECT COUNT(*) as count FROM ${table}`,
    );
    return Number(rows[0]?.count ?? rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

export async function fetchLibraryCounts(provider = activeProvider()): Promise<LibraryCounts> {
  if (provider === "mangadex") {
    try {
      await initMangaDexDb();
      const [followed, bookmarks, history] = await Promise.all([
        countMdxTable("followed_manga"),
        countMdxTable("bookmarks"),
        countMdxTable("reading_history"),
      ]);
      return { followed, bookmarks, history };
    } catch {
      return { followed: 0, bookmarks: 0, history: 0 };
    }
  }

  const [followed, collections, bookmarks, history, local] = await Promise.all([
    countDynastyTable("followed_series"),
    countDynastyTable("collections"),
    countDynastyTable("bookmarks"),
    countDynastyTable("reading_history"),
    countDynastyTable("local_series"),
  ]);
  return { followed, collections, bookmarks, history, local };
}

export function useLibraryCounts(): {
  counts: Accessor<LibraryCounts>;
  refetchCounts: () => Promise<void>;
} {
  const [rev, setRev] = createSignal(0);
  const bump = () => setRev((v) => v + 1);

  onMount(() => {
    const unsubs = [
      onFollowedChanged(bump),
      onBookmarksChanged(bump),
      onHistoryChanged(bump),
      onCollectionsChanged(bump),
      onLocalChanged(bump),
    ];
    onCleanup(() => {
      for (const unsub of unsubs) unsub();
    });
  });

  const [countsResource, { refetch }] = createResource(
    () => (dbReady() ? { provider: activeProvider(), rev: rev() } : undefined),
    ({ provider }) => fetchLibraryCounts(provider),
  );
  const counts: Accessor<LibraryCounts> = () => countsResource() ?? {};
  return {
    counts,
    refetchCounts: async () => {
      await refetch();
    },
  };
}
