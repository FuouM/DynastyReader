import { createEffect, createSignal, For, Show } from "solid-js";
import { Modal } from "../components/Modal";
import { StatCard, IconButton } from "../components/Button";
import { Icon, CheckIcon, WarningIcon, RefreshIcon } from "../components/Icon";
import { t } from "../i18n";
import {
  runIntegrityCheck,
  runIntegrityRecovery,
  type IntegrityReport,
  type RecoveryResult,
} from "./cache-integrity";

export interface IntegrityModalProps {
  open: boolean;
  onClose: () => void;
  onRepaired?: () => void;
}

export function IntegrityModal(props: IntegrityModalProps) {
  const [stage, setStage] = createSignal<"idle" | "scanning" | "scanned" | "recovering" | "recovered">("idle");
  const [report, setReport] = createSignal<IntegrityReport | null>(null);
  const [recoveryResult, setRecoveryResult] = createSignal<RecoveryResult | null>(null);
  const [scannedCount, setScannedCount] = createSignal(0);
  const [totalCount, setTotalCount] = createSignal(0);
  const [phaseText, setPhaseText] = createSignal("");

  const startScan = async () => {
    setStage("scanning");
    setReport(null);
    setRecoveryResult(null);
    setScannedCount(0);
    setTotalCount(0);
    setPhaseText("");

    try {
      const rep = await runIntegrityCheck((scanned, total) => {
        setScannedCount(scanned);
        setTotalCount(total);
      });
      setReport(rep);
      setStage("scanned");
    } catch {
      setStage("scanned");
    }
  };

  createEffect(() => {
    if (props.open && stage() === "idle") {
      void startScan();
    } else if (!props.open) {
      setStage("idle");
      setReport(null);
      setRecoveryResult(null);
    }
  });

  const handleRecover = async () => {
    const rep = report();
    if (!rep || rep.issues.length === 0) return;

    setStage("recovering");
    try {
      const res = await runIntegrityRecovery(rep.issues, (phase, cur, tot) => {
        if (phase === "deleting_corrupt") {
          setPhaseText(t("cache.integrityPhaseDeleting", { current: cur, total: tot }));
        } else if (phase === "cleaning_db") {
          setPhaseText(t("cache.integrityPhaseCleaning", { current: cur, total: tot }));
        } else if (phase === "recovering_covers") {
          setPhaseText(t("cache.integrityPhaseCovers", { current: cur, total: tot }));
        } else if (phase === "queuing_chapters") {
          setPhaseText(t("cache.integrityPhaseChapters", { current: cur, total: tot }));
        }
      });
      setRecoveryResult(res);
      setStage("recovered");
      props.onRepaired?.();
    } catch {
      setStage("recovered");
      props.onRepaired?.();
    }
  };

  const hasIssues = () => {
    const r = report();
    return r ? r.totalMissing > 0 || r.totalCorrupted > 0 : false;
  };

  const progressPercent = () => {
    const total = totalCount();
    if (total <= 0) return 0;
    return Math.min(100, Math.round((scannedCount() / total) * 100));
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      canClose={() => stage() !== "scanning" && stage() !== "recovering"}
      width={560}
      title={
        <div style="display:flex;align-items:center;gap:8px;">
          <Icon name="shield-check" class="ds-icon-16" />
          <span>{t("cache.integrityModalTitle")}</span>
        </div>
      }
      body={
        <div class="ds-integrity-modal-body">
          {/* Scanning Progress */}
          <Show when={stage() === "scanning"}>
            <div class="ds-integrity-center-box">
              <Icon name="arrow-clockwise" class="ds-cover-icon-spin" style="font-size:28px;color:var(--sys-primary);" />
              <div class="ds-integrity-status-text">
                {t("cache.integrityScanning", { scanned: scannedCount(), total: totalCount() })}
              </div>
              <div class="ds-integrity-progress-track">
                <div class="ds-integrity-progress-fill" style={{ width: `${progressPercent()}%` }} />
              </div>
            </div>
          </Show>

          {/* Recovering Progress */}
          <Show when={stage() === "recovering"}>
            <div class="ds-integrity-center-box">
              <Icon name="gear-wide-connected" class="ds-cover-icon-spin" style="font-size:28px;color:var(--sys-primary);" />
              <div class="ds-integrity-status-text">
                {phaseText() || t("cache.integrityCleaning")}
              </div>
            </div>
          </Show>

          {/* Scanned / Results */}
          <Show when={stage() === "scanned" && report() !== null}>
            <Show
              when={hasIssues()}
              fallback={
                <div class="ds-integrity-result-card ds-integrity-result--healthy">
                  <div class="ds-integrity-header-row">
                    <CheckIcon class="ds-integrity-status-icon ds-text-success" />
                    <div>
                      <div class="ds-integrity-title">{t("cache.integrityHealthy")}</div>
                      <div class="ds-integrity-subtitle">
                        {t("cache.integrityHealthyDesc", {
                          total: report()!.totalScanned,
                          pages: report()!.pageCount,
                          covers: report()!.coverCount,
                        })}
                      </div>
                    </div>
                  </div>
                  <div class="ds-stats-grid ds-stats-grid--3" style="margin-top:12px;">
                    <StatCard value={report()!.totalScanned} label={t("cache.integrityStatScanned")} />
                    <StatCard value={report()!.totalHealthy} label={t("cache.integrityStatHealthy")} />
                    <StatCard value={0} label={t("cache.integrityStatMissing")} />
                  </div>
                </div>
              }
            >
              <div class="ds-integrity-result-card ds-integrity-result--warning">
                <div class="ds-integrity-header-row">
                  <WarningIcon class="ds-integrity-status-icon ds-text-warning" />
                  <div>
                    <div class="ds-integrity-title">
                      {t("cache.integrityIssuesFound", {
                        missing: report()!.totalMissing,
                        corrupted: report()!.totalCorrupted,
                      })}
                    </div>
                    <div class="ds-integrity-subtitle">
                      {t("cache.integrityIssuesDesc", { count: report()!.issues.length })}
                    </div>
                  </div>
                </div>

                <div class="ds-stats-grid ds-stats-grid--4" style="margin-top:12px;">
                  <StatCard value={report()!.totalScanned} label={t("cache.integrityStatScanned")} />
                  <StatCard value={report()!.totalHealthy} label={t("cache.integrityStatHealthy")} />
                  <StatCard value={report()!.totalMissing} label={t("cache.integrityStatMissing")} />
                  <StatCard value={report()!.totalCorrupted} label={t("cache.integrityStatCorrupted")} />
                </div>

                <div class="ds-integrity-details-header">
                  <span>{t("cache.integrityDetailsTitle")}</span>
                  <span class="ds-muted">({report()!.issues.length})</span>
                </div>

                <div class="ds-integrity-issues-list">
                  <For each={report()!.issues.slice(0, 100)}>
                    {(issue) => (
                      <div class="ds-integrity-issue-item">
                        <span class={`ds-integrity-type-badge ds-integrity-type--${issue.type}`}>
                          {issue.type.toUpperCase()}
                        </span>
                        <div class="ds-integrity-issue-info">
                          <div class="ds-integrity-issue-id" title={issue.path || issue.id}>
                            {issue.chapterPermalink ? `${issue.chapterPermalink} [p.${(issue.pageIndex ?? 0) + 1}]` : (issue.seriesPermalink || issue.cacheKey || issue.path)}
                          </div>
                          <div class="ds-integrity-issue-reason ds-muted">{issue.reason}</div>
                        </div>
                        <span class={`ds-integrity-issue-badge ${issue.isCorrupted ? "ds-badge--corrupted" : "ds-badge--missing"}`}>
                          {issue.isCorrupted ? t("cache.integrityStatCorrupted") : t("cache.integrityStatMissing")}
                        </span>
                      </div>
                    )}
                  </For>
                  <Show when={report()!.issues.length > 100}>
                    <div class="ds-muted" style="text-align:center;padding:4px;">
                      +{report()!.issues.length - 100} more items...
                    </div>
                  </Show>
                </div>
              </div>
            </Show>
          </Show>

          {/* Recovery Finished */}
          <Show when={stage() === "recovered" && recoveryResult() !== null}>
            <div class="ds-integrity-result-card ds-integrity-result--healthy">
              <div class="ds-integrity-header-row">
                <CheckIcon class="ds-integrity-status-icon ds-text-success" />
                <div>
                  <div class="ds-integrity-title">{t("cache.integrityRecoveredTitle")}</div>
                  <div class="ds-integrity-subtitle">
                    {t("cache.integrityReportRecovered", {
                      covers: recoveryResult()!.recoveredCovers,
                      chapters: recoveryResult()!.queuedChapters,
                      cleaned: recoveryResult()!.cleanedRecords,
                    })}
                  </div>
                </div>
              </div>
              <div class="ds-stats-grid ds-stats-grid--4" style="margin-top:12px;">
                <StatCard value={recoveryResult()!.recoveredCovers} label={t("cache.integrityStatCoversRecovered")} />
                <StatCard value={recoveryResult()!.queuedChapters} label={t("cache.integrityStatChaptersQueued")} />
                <StatCard value={recoveryResult()!.cleanedRecords} label={t("cache.integrityStatRecordsCleaned")} />
                <StatCard value={recoveryResult()!.deletedFiles} label={t("cache.integrityStatFilesDeleted")} />
              </div>
            </div>
          </Show>
        </div>
      }
      footer={
        <div class="ds-modal-actions">
          <Show when={stage() === "scanned" && hasIssues()}>
            <IconButton
              icon={<RefreshIcon />}
              text={t("cache.integrityRecheck")}
              onClick={() => void startScan()}
            />
            <IconButton
              icon={<Icon name="wrench-adjustable-circle" />}
              text={t("cache.integrityRecoverNow")}
              title={t("cache.integrityRecoverTooltip")}
              onClick={() => void handleRecover()}
            />
            <IconButton
              text={t("common.cancel")}
              onClick={props.onClose}
            />
          </Show>

          <Show when={(stage() === "scanned" && !hasIssues()) || stage() === "recovered"}>
            <IconButton
              icon={<RefreshIcon />}
              text={t("cache.integrityRecheck")}
              onClick={() => void startScan()}
            />
            <IconButton
              text={t("cache.integrityNoIssuesAction")}
              onClick={props.onClose}
            />
          </Show>
        </div>
      }
    />
  );
}
