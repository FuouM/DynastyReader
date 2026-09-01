/**
 * Shared error row with retry button for data-loading views.
 * Extracted from `CacheView.tsx` / `SeriesView.tsx` / `BlacklistView.tsx`
 * for modularity.
 */

import { IconButton } from "./Button";
import { RefreshIcon } from "./Icon";
import { t } from "../i18n";

interface ErrorRetryRowProps {
  message: string;
  onRetry: () => void;
  className?: string;
}

export function ErrorRetryRow(props: ErrorRetryRowProps) {
  return (
    <div class={`ds-error-row ${props.className ?? ""}`}>
      <span class="ds-muted">{props.message}</span>
      <IconButton
        icon={<RefreshIcon />}
        text={t("common.retry")}
        onClick={props.onRetry}
      />
    </div>
  );
}
