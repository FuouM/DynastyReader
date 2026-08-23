import { createSignal, onCleanup } from "solid-js";

/**
 * Shared image retry hook: retries up to `maxAttempts` times with increasing
 * delay (`attempt * delayMs`) before giving up and setting error state.
 *
 * Call `reset()` when the source path changes to restart the retry counter.
 */
export function useImageRetry(opts?: { maxAttempts?: number; delayMs?: number }) {
  const maxAttempts = opts?.maxAttempts ?? 2;
  const delayMs = opts?.delayMs ?? 1200;

  const [error, setError] = createSignal(false);
  const [retryNonce, setRetryNonce] = createSignal(0);
  let retryTimer: number | null = null;
  let retryAttempts = 0;

  onCleanup(() => {
    if (retryTimer !== null) window.clearTimeout(retryTimer);
  });

  /** Reset error state and retry counter (call when source path changes). */
  const reset = () => {
    setError(false);
    retryAttempts = 0;
  };

  /** Call from an `onError` handler to trigger retry or give up. */
  const handleError = (onRetry?: () => void) => {
    if (retryAttempts < maxAttempts) {
      retryAttempts++;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        setError(false);
        onRetry?.();
        setRetryNonce((n) => n + 1);
      }, retryAttempts * delayMs);
    } else {
      setError(true);
    }
  };

  /** Manual retry (e.g. on placeholder click). */
  const retry = (onRetry?: () => void) => {
    retryAttempts = 0;
    setError(false);
    onRetry?.();
    setRetryNonce((n) => n + 1);
  };

  return {
    error,
    retryNonce,
    handleError,
    retry,
    reset,
    /** Reactive accessor for whether the image should be shown. */
    showImage: (isValidSource: boolean) => isValidSource && !error(),
  };
}

/**
 * Reactive media query hook. Returns a boolean signal that tracks
 * whether the given CSS media query matches.
 */
export function useMediaQuery(query: string): () => boolean {
  const [matches, setMatches] = createSignal<boolean>(
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  if (typeof window !== "undefined") {
    const mq = window.matchMedia(query);
    const update = (e: MediaQueryListEvent | MediaQueryList) => setMatches(e.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
    }
  }

  return matches;
}
