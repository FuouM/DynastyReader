import { createSignal, onCleanup } from "solid-js";

export interface UseImageRetryOptions {
  maxAttempts?: number;
  delayMs?: number;
}

/**
 * Shared image retry hook:
 * - Immediately sets `error(true)` on load failure so broken `<img>` tags are
 *   unmounted and replaced with placeholders (never showing broken image icons).
 * - Automatically retries up to `maxAttempts` times with increasing delay.
 * - Exposes `isRetrying` to allow showing a loading/shimmer placeholder during retries.
 * - Exposes `retryNonce` to append as a cache-buster query parameter to force re-fetch.
 * - Supports manual `retry()` (e.g. clicking the placeholder) to restart fresh.
 */
export function useImageRetry(opts?: UseImageRetryOptions) {
  const maxAttempts = opts?.maxAttempts ?? 2;
  const delayMs = opts?.delayMs ?? 1200;

  const [error, setError] = createSignal(false);
  const [isRetrying, setIsRetrying] = createSignal(false);
  const [retryNonce, setRetryNonce] = createSignal(0);
  let retryTimer: number | null = null;
  let retryAttempts = 0;

  const clearTimer = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  onCleanup(() => {
    clearTimer();
  });

  /** Reset error state and retry counter (call when source path changes). */
  const reset = () => {
    clearTimer();
    setError(false);
    setIsRetrying(false);
    retryAttempts = 0;
  };

  /** Call from an `onError` handler to trigger retry or give up. */
  const handleError = (onRetry?: () => void) => {
    clearTimer();
    // Immediately set error = true so broken <img> is replaced by placeholder
    setError(true);

    if (retryAttempts < maxAttempts) {
      retryAttempts++;
      setIsRetrying(true);
      retryTimer = setTimeout(() => {
        setIsRetrying(false);
        onRetry?.();
        setRetryNonce((n) => n + 1);
        setError(false);
      }, retryAttempts * delayMs) as unknown as number;
    } else {
      setIsRetrying(false);
    }
  };

  /** Manual retry (e.g. on placeholder click). */
  const retry = (onRetry?: () => void) => {
    clearTimer();
    retryAttempts = 0;
    setIsRetrying(false);
    onRetry?.();
    setRetryNonce((n) => n + 1);
    setError(false);
  };

  return {
    error,
    isRetrying,
    retryNonce,
    handleError,
    retry,
    reset,
    /** Reactive accessor for whether the image should be shown. */
    showImage: (isValidSource: boolean) => isValidSource && !error(),
  };
}
