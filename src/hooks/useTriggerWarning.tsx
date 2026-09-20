/**
 * Host hook for the Content/Trigger Warning modal. Folds the
 * `warning`-signal + `<TriggerWarningModal>` boilerplate that four views
 * (BrowseFeed, BrowseSearch, BrowseDirectory) duplicated verbatim.
 *
 * Usage: `const trigger = useTriggerWarning();` then call
 * `trigger.warn(title, matchedTags, proceed)` from a row and render
 * `{trigger.host}` at the bottom of the view.
 */

import { createSignal, type JSX } from "solid-js";
import { TriggerWarningModal } from "../components/TriggerWarning";

export interface WarningRequest {
  title: string;
  matchedTags: string[];
  onProceed: () => void;
}

export interface TriggerWarningApi {
  warn: (title: string, matchedTags: string[], onProceed: () => void) => void;
  host: JSX.Element;
}

export function useTriggerWarning(): TriggerWarningApi {
  const [warning, setWarning] = createSignal<WarningRequest | null>(null);

  const warn = (
    title: string,
    matchedTags: string[],
    onProceed: () => void,
  ): void => {
    setWarning({ title, matchedTags, onProceed });
  };

  const close = (): void => {
    setWarning(null);
  };

  const host: JSX.Element = (
    <TriggerWarningModal
      open={warning() !== null}
      title={warning()?.title ?? ""}
      matchedTags={warning()?.matchedTags ?? []}
      onClose={close}
      onProceed={() => {
        const fn = warning()?.onProceed;
        close();
        fn?.();
      }}
    />
  );

  return { warn, host };
}
