import { createEffect, createSignal, Show } from "solid-js";
import { DsSelect, DsSwitch, IconButton, IconText } from "../components/Button";
import { GroupBox } from "../components/GroupBox";
import { RefreshIcon, StorageIcon } from "../components/Icon";
import { pruneOldestReadCachedPages } from "../db/cache.repo";
import { t } from "../i18n";
import { downloadingChapterPermalinks } from "../stores/download";
import { showBanner } from "../stores/topbar";
import {
  CACHE_CEILING_PRESETS,
  cacheAutoPruneEnabled,
  cacheCeilingBytes,
  setCacheAutoPruneEnabled,
  setCacheCeilingBytes,
} from "../utils/cache-quota";
import { errorMessage } from "../utils/errors";
import { formatBytes } from "../utils/formatting";

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export interface CacheCeilingGroupBoxProps {
  totalSizeBytes: number;
  onPruned: () => void;
}

export function CacheCeilingGroupBox(props: CacheCeilingGroupBoxProps) {
  const [pruning, setPruning] = createSignal(false);

  const bytesToInputAndUnit = (bytes: number): { input: string; unit: "GB" | "MB" } => {
    if (bytes <= 0) return { input: "", unit: "GB" };
    if (bytes % GB === 0) return { input: String(bytes / GB), unit: "GB" };
    if (bytes % MB === 0 && bytes < GB) return { input: String(bytes / MB), unit: "MB" };
    if (bytes >= GB) return { input: String(Number((bytes / GB).toFixed(2))), unit: "GB" };
    return { input: String(Number((bytes / MB).toFixed(1))), unit: "MB" };
  };

  const isMatchingPreset = () =>
    CACHE_CEILING_PRESETS.some((p) => p.bytes === cacheCeilingBytes());

  const [isCustomMode, setIsCustomMode] = createSignal(!isMatchingPreset());
  const initialCeiling = bytesToInputAndUnit(cacheCeilingBytes());
  const [ceilingInput, setCeilingInput] = createSignal<string>(initialCeiling.input);
  const [ceilingUnit, setCeilingUnit] = createSignal<"GB" | "MB">(initialCeiling.unit);

  const dropdownValue = () => {
    if (isCustomMode()) return "custom";
    const match = CACHE_CEILING_PRESETS.find((p) => p.bytes === cacheCeilingBytes());
    return match ? String(match.bytes) : "custom";
  };

  createEffect(() => {
    const b = cacheCeilingBytes();
    if (!isMatchingPreset()) {
      setIsCustomMode(true);
    }
    const curNum = parseFloat(ceilingInput().trim());
    const curMult = ceilingUnit() === "MB" ? MB : GB;
    const curBytes = isNaN(curNum) || curNum <= 0 ? 0 : Math.round(curNum * curMult);
    if (curBytes !== b && b > 0) {
      const res = bytesToInputAndUnit(b);
      setCeilingInput(res.input);
      setCeilingUnit(res.unit);
    }
  });

  const handleDropdownChange = (val: string) => {
    if (val === "custom") {
      setIsCustomMode(true);
      if (cacheCeilingBytes() === 0) {
        setCacheCeilingBytes(10 * GB);
      }
      const res = bytesToInputAndUnit(cacheCeilingBytes());
      setCeilingInput(res.input);
      setCeilingUnit(res.unit);
    } else {
      setIsCustomMode(false);
      const bytes = Number(val) || 0;
      setCacheCeilingBytes(bytes);
      const res = bytesToInputAndUnit(bytes);
      setCeilingInput(res.input);
      setCeilingUnit(res.unit);
    }
  };

  const handleCustomInput = (val: string) => {
    setCeilingInput(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setCacheCeilingBytes(0);
      return;
    }
    const num = parseFloat(trimmed);
    if (isNaN(num) || num <= 0) {
      setCacheCeilingBytes(0);
      return;
    }
    const mult = ceilingUnit() === "MB" ? MB : GB;
    setCacheCeilingBytes(Math.round(num * mult));
  };

  const handleUnitChange = (u: "GB" | "MB") => {
    setCeilingUnit(u);
    const num = parseFloat(ceilingInput().trim());
    if (!isNaN(num) && num > 0) {
      const mult = u === "MB" ? MB : GB;
      setCacheCeilingBytes(Math.round(num * mult));
    }
  };

  const ceilingUsage = (): string => {
    const ceiling = cacheCeilingBytes();
    const used = formatBytes(props.totalSizeBytes);
    return ceiling > 0
      ? t("cache.ceilingUsageLimited", { used, ceiling: formatBytes(ceiling) })
      : t("cache.ceilingUsageUnlimited", { used });
  };

  const handlePruneNow = async () => {
    const ceiling = cacheCeilingBytes();
    if (ceiling <= 0 || pruning()) return;
    setPruning(true);
    try {
      const res = await pruneOldestReadCachedPages(ceiling, downloadingChapterPermalinks());
      showBanner(
        res.prunedChapters > 0
          ? t("cache.pruneDone", { count: res.prunedChapters, freed: formatBytes(res.freedBytes) })
          : t("cache.pruneNoop"),
      );
      props.onPruned();
    } catch (err) {
      showBanner(errorMessage(err));
    } finally {
      setPruning(false);
    }
  };

  return (
    <GroupBox title={<IconText icon={<StorageIcon />}>{t("cache.ceilingTitle")}</IconText>}>
      <div class="ds-col" style="gap:8px;">
        <div class="ds-flex-row" style="align-items:center;flex-wrap:wrap;gap:8px;">
          <label for="ds-cache-ceiling-select" class="ds-muted">{t("cache.ceilingLabel")}</label>
          <DsSelect
            id="ds-cache-ceiling-select"
            aria-label={t("cache.ceilingLabel")}
            value={dropdownValue()}
            style="height:24px;min-width:110px;"
            options={[
              ...CACHE_CEILING_PRESETS.map((p) => ({
                value: String(p.bytes),
                label: p.labelKey ? t(p.labelKey) : p.label,
              })),
              { value: "custom", label: t("cache.ceilingCustom") },
            ]}
            onChange={handleDropdownChange}
          />
          <Show when={isCustomMode()}>
            <div style="display:inline-flex;align-items:center;gap:4px;">
              <input
                type="number"
                id="ds-cache-ceiling-input"
                class="input-field"
                aria-label={t("cache.ceilingCustomInput")}
                style="width:72px;height:24px;text-align:right;padding-right:4px;"
                min="0"
                step="any"
                placeholder="0"
                value={ceilingInput()}
                onInput={(e) => handleCustomInput(e.currentTarget.value)}
              />
              <DsSelect
                id="ds-cache-ceiling-unit"
                value={ceilingUnit()}
                style="height:24px;width:68px;"
                options={[
                  { value: "GB", label: "GB" },
                  { value: "MB", label: "MB" },
                ]}
                onChange={(u) => handleUnitChange(u as "GB" | "MB")}
              />
            </div>
          </Show>
        </div>
        <div class="ds-muted">{ceilingUsage()}</div>
        <div class="ds-cache-actions" style="align-items:center;">
          <label class="ds-flex-row ds-items-center" style="gap:6px;cursor:pointer;">
            <DsSwitch
              id="ds-cache-auto-prune"
              ariaLabel={t("cache.autoPruneLabel")}
              checked={cacheAutoPruneEnabled()}
              disabled={cacheCeilingBytes() <= 0}
              title={t("cache.autoPruneTooltip")}
              onChange={(next) => setCacheAutoPruneEnabled(next)}
            />
            <span class="ds-muted">{t("cache.autoPruneLabel")}</span>
          </label>
          <IconButton
            icon={<RefreshIcon />}
            text={pruning() ? t("cache.pruneRunning") : t("cache.pruneNow")}
            title={t("cache.pruneNowTooltip")}
            disabled={cacheCeilingBytes() <= 0 || pruning()}
            onClick={() => void handlePruneNow()}
          />
        </div>
      </div>
    </GroupBox>
  );
}
