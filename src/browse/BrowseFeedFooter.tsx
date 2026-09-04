/**
 * Status and controls footer for the Browse Feed pane:
 * Database timestamp, etag cache tag, real-time live session traffic counter,
 * manual Check Updates button, pagination bar, and scroll-to-top trigger.
 * Extracted from `BrowseFeed.tsx` for modularity.
 */

import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";
import { formatBytes, formatDateTime } from "../utils/formatting";
import { t } from "../i18n";
import { getSessionTraffic, subscribeSessionTraffic } from "../api";
import { browseCovers } from "./browse-covers";
import { IconText, IconButton } from "../components/Button";
import {
  RefreshIcon,
  CheckIcon,
  WarningIcon,
  DatabaseIcon,
  HashIcon,
  TrafficIcon,
  ArrowUpIcon,
} from "../components/Icon";

export const CHECK_STATE_RESET_MS = 2000;
export const SCROLL_TOP_POLL_MS = 200;

export interface FeedStatusFooterState {
  cachedAt?: number;
  etag?: string;
  status: string;
  etagStatus?: string;
  isStale: boolean;
}

export interface BrowseFeedFooterProps {
  state: FeedStatusFooterState;
  pager?: JSX.Element;
  getHost: () => HTMLElement | null;
  onCheckUpdates: () => Promise<string>;
}

export function BrowseFeedFooter(props: BrowseFeedFooterProps) {
  const [traffic, setTraffic] = createSignal(getSessionTraffic());
  const [checkState, setCheckState] = createSignal<"idle" | "checking" | "ready" | "synced" | "failed">("idle");

  let cleanupScrollTop: (() => void) | null = null;
  onMount(() => {
    const unsub = subscribeSessionTraffic((t) => setTraffic(t));
    onCleanup(() => {
      unsub();
      cleanupScrollTop?.();
    });
  });

  const handleCheck = async (): Promise<void> => {
    setCheckState("checking");
    try {
      const outcome = await props.onCheckUpdates();
      if (outcome === "new-chapters") {
        setCheckState("ready");
      } else if (outcome === "unchanged") {
        setCheckState("synced");
        window.setTimeout(() => setCheckState("idle"), CHECK_STATE_RESET_MS);
      } else {
        setCheckState("idle");
      }
    } catch {
      setCheckState("failed");
      window.setTimeout(() => setCheckState("idle"), CHECK_STATE_RESET_MS);
    }
  };

  const onScrollTop = (): void => {
    const dsView = document.getElementById("ds-pane-browse") || document.getElementById("ds-view");
    if (!dsView || dsView.scrollTop <= 0) return;

    // Pause hydration pumps during the smooth scroll so flying elements never
    // trigger observations; resume only once the view has genuinely settled.
    browseCovers.scrollToTop();
    dsView.scrollTo({ top: 0, behavior: "smooth" });

    let settled = false;
    let topTimer: number | null = null;
    let maxSafetyTimer: number | null = null;
    cleanupScrollTop?.();

    const settle = (): void => {
      if (settled) return;
      settled = true;
      if (maxSafetyTimer !== null) {
        window.clearTimeout(maxSafetyTimer);
        maxSafetyTimer = null;
      }
      cleanupScrollTop = null;
      dsView.removeEventListener("scroll", checkArrival);
      dsView.removeEventListener("scrollend", settle);
      if (topTimer !== null) {
        window.clearInterval(topTimer);
        topTimer = null;
      }
      const host = props.getHost();
      if (host && host === browseCovers.currentHydrationHost) {
        browseCovers.resumeAfterScrollToTop(host);
      }
    };
    const checkArrival = (): void => {
      if (dsView.scrollTop <= 0) settle();
    };
    cleanupScrollTop = () => {
      if (maxSafetyTimer !== null) {
        window.clearTimeout(maxSafetyTimer);
        maxSafetyTimer = null;
      }
      dsView.removeEventListener("scroll", checkArrival);
      dsView.removeEventListener("scrollend", settle);
      if (topTimer !== null) {
        window.clearInterval(topTimer);
        topTimer = null;
      }
    };
    maxSafetyTimer = window.setTimeout(settle, 2500);
    dsView.addEventListener("scrollend", settle, { passive: true });
    dsView.addEventListener("scroll", checkArrival, { passive: true });
    topTimer = window.setInterval(() => {
      if (dsView.scrollTop <= 0) settle();
    }, SCROLL_TOP_POLL_MS);
  };

  const CHECK_STATE_CONFIG = {
    checking: { icon: <RefreshIcon spin={true} />, labelKey: "browse.feed.statusCheckChecking" as const },
    ready: { icon: <ArrowUpIcon />, labelKey: "browse.feed.statusCheckReady" as const },
    synced: { icon: <CheckIcon />, labelKey: "browse.feed.statusCheckSynced" as const },
    failed: { icon: <WarningIcon />, labelKey: "browse.feed.statusCheckFailed" as const },
  };

  const checkBtnIcon = (): JSX.Element => {
    const cfg = CHECK_STATE_CONFIG[checkState() as keyof typeof CHECK_STATE_CONFIG];
    return cfg?.icon ?? <RefreshIcon />;
  };

  const checkBtnText = (): string => {
    const cfg = CHECK_STATE_CONFIG[checkState() as keyof typeof CHECK_STATE_CONFIG];
    return t(cfg?.labelKey ?? "browse.feed.statusCheckDefault");
  };

  return (
    <div class="ds-feed-status-bar">
      <div class="ds-feed-status-left">
        <span
          class="ds-status-item ds-status-db"
          title={t("browse.feed.statusDbTitle", { date: formatDateTime(props.state.cachedAt) })}
        >
          <IconText icon={<DatabaseIcon />}>{formatDateTime(props.state.cachedAt)}</IconText>
        </span>
        <Show when={props.state.status}>
          <span
            class={`ds-status-pill ${props.state.isStale ? "stale" : "fresh"}`}
            title={t("browse.feed.statusCacheTitle", { status: props.state.status })}
          >
            {props.state.status}
          </span>
        </Show>
        <Show when={props.state.etag}>
          <span class="ds-etag-tag" title={t("browse.feed.statusEtagTitle", { etag: props.state.etag, status: props.state.etagStatus || "Cached" })}>
            <HashIcon /> <span class="ds-etag-hash">{props.state.etag!.replace(/^"|"$/g, "").slice(0, 8)}</span>
          </span>
        </Show>
        <span
          class="ds-status-item ds-status-traffic"
          title={t("browse.feed.statusTrafficTooltip", {
            sessionBytes: formatBytes(traffic().bytesDownloaded),
            sessionReqs: traffic().networkRequests,
            sessionHits: traffic().cacheHits,
            sessionSaved: formatBytes(traffic().bytesSaved),
            lifetimeBytes: formatBytes(traffic().lifetime.bytesDownloaded),
            lifetimeReqs: traffic().lifetime.networkRequests,
            lifetimeHits: traffic().lifetime.cacheHits,
            lifetimeSaved: formatBytes(traffic().lifetime.bytesSaved),
          })}
        >
          <IconText icon={<TrafficIcon />}>{formatBytes(traffic().bytesDownloaded, "", 1)}</IconText>
        </span>
      </div>
      <div class="ds-feed-status-right">
        <IconButton
          className="ds-status-refresh-btn"
          title={t("browse.feed.statusForceCheckTooltip")}
          disabled={checkState() === "checking"}
          onClick={() => void handleCheck()}
          icon={checkBtnIcon()}
          text={checkBtnText()}
        />
        <div class="ds-feed-status-pager-wrap ds-ml-auto">
          <Show when={props.pager}>{props.pager}</Show>
        </div>
        <IconButton
          icon={<ArrowUpIcon />}
          text={t("common.top")}
          className="ds-scroll-top-btn"
          title={t("browse.feed.statusScrollTopTooltip")}
          onClick={onScrollTop}
        />
      </div>
    </div>
  );
}
