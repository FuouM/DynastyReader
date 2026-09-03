/**
 * Small action-bar / empty-state components shared across views. Port of `action-bar.ts`.
 */

import { t } from "../i18n";
import { ArrowLeftIcon, RefreshIcon } from "./Icon";
import { IconButton } from "./Button";


export interface BackRefreshActionsProps {
  backLabel: string;
  onBack: () => void;
  onRefresh: () => void;
}

/** The standard "Back + Refresh" top-bar pair used by the Library sub-views. */
export function BackRefreshActions(props: BackRefreshActionsProps) {
  return (
    <>
      <IconButton
        icon={<ArrowLeftIcon />}
        text={props.backLabel}
        title={t("actionBar.back")}
        onClick={props.onBack}
      />
      <IconButton
        icon={<RefreshIcon />}
        text={t("actionBar.refresh")}
        title={t("actionBar.refresh")}
        onClick={props.onRefresh}
      />
    </>
  );
}

