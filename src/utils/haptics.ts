/**
 * Cross-platform haptic feedback utility for DynastyReader.
 *
 * Calls native AndroidThemeBridge.triggerHaptic() when running on Android,
 * with graceful fallback to navigator.vibrate() in browser environments.
 */
import { persistedSignal } from "../lib/persisted-signal";
import { log } from "./log";

declare global {
  interface AndroidThemeBridge {
    triggerHaptic?(style: string): void;
    triggerHapticAdvanced?(style: string, durationMs: number, amplitude: number): void;
    triggerHapticConstant?(constant: number): void;
    openUrl?(url: string): boolean;
    updateTheme?(isDark: boolean, color: string): void;
    /** ConnectivityManager.isActiveNetworkMetered (QoL-D5 Wi-Fi-only mode). */
    isConnectionMetered?(): boolean;
    setStatusBarVisible?(visible: boolean): void;
    setStatusBarHidden?(hidden: boolean): void;
  }

  interface Window {
    AndroidThemeBridge?: AndroidThemeBridge;
  }
}

export type HapticStyle = "snap" | "confirm" | "tap" | "page-turn";

/** User master toggle for haptic feedback across the application (H-01). */
export const [isHapticsEnabled, setHapticsEnabled] = persistedSignal<boolean>(true, {
  name: "ds_haptics_enabled",
});


/** Master vibration strength / motor amplitude percentage (1-100%). Default 100%. */
export const DEFAULT_HAPTIC_STRENGTH = 100;

export const [hapticStrength, setHapticStrengthRaw] = persistedSignal<number>(
  DEFAULT_HAPTIC_STRENGTH,
  { name: "ds_haptic_strength" },
);

export function setHapticStrength(val: number): void {
  const clamped = Math.max(1, Math.min(100, Math.round(val)));
  setHapticStrengthRaw(clamped);
}

export function resetHapticStrength(): void {
  setHapticStrength(DEFAULT_HAPTIC_STRENGTH);
}

/** Computes hardware amplitude (1-255) for Android Vibrator from strength percentage. */
export function getHapticAmplitude(): number {
  const pct = Math.max(1, Math.min(100, hapticStrength()));
  return Math.round((pct / 100) * 255);
}
/** Granular toggle for discrete page-turn haptic ticks. */
export const [isPageTurnHapticsEnabled, setPageTurnHapticsEnabled] = persistedSignal<boolean>(true, {
  name: "ds_haptics_page_turn_enabled",
});

/** Granular toggle for chapter overscroll and boundary snap haptics. */
export const [isOverscrollHapticsEnabled, setOverscrollHapticsEnabled] = persistedSignal<boolean>(true, {
  name: "ds_haptics_overscroll_enabled",
});

/** Default duration in ms for each haptic style. */
export const DEFAULT_HAPTIC_DURATIONS: Record<HapticStyle, number> = {
  tap: 15,
  "page-turn": 20,
  snap: 40,
  confirm: 25,
};

/** Persisted custom durations for each style. */
export const [hapticTapDuration, setHapticTapDuration] = persistedSignal<number>(
  DEFAULT_HAPTIC_DURATIONS.tap,
  { name: "ds_haptic_dur_tap" },
);

export const [hapticPageTurnDuration, setHapticPageTurnDuration] = persistedSignal<number>(
  DEFAULT_HAPTIC_DURATIONS["page-turn"],
  { name: "ds_haptic_dur_page_turn" },
);

export const [hapticSnapDuration, setHapticSnapDuration] = persistedSignal<number>(
  DEFAULT_HAPTIC_DURATIONS.snap,
  { name: "ds_haptic_dur_snap" },
);

export const [hapticConfirmDuration, setHapticConfirmDuration] = persistedSignal<number>(
  DEFAULT_HAPTIC_DURATIONS.confirm,
  { name: "ds_haptic_dur_confirm" },
);

export function getHapticDuration(style: HapticStyle): number {
  switch (style) {
    case "tap":
      return hapticTapDuration();
    case "page-turn":
      return hapticPageTurnDuration();
    case "snap":
      return hapticSnapDuration();
    case "confirm":
      return hapticConfirmDuration();
  }
}

export function setHapticDuration(style: HapticStyle, val: number): void {
  const clamped = Math.max(5, Math.min(250, Math.round(val)));
  switch (style) {
    case "tap":
      setHapticTapDuration(clamped);
      break;
    case "page-turn":
      setHapticPageTurnDuration(clamped);
      break;
    case "snap":
      setHapticSnapDuration(clamped);
      break;
    case "confirm":
      setHapticConfirmDuration(clamped);
      break;
  }
}

export function resetHapticDuration(style: HapticStyle): void {
  setHapticDuration(style, DEFAULT_HAPTIC_DURATIONS[style]);
}

export function resetAllHapticDurations(): void {
  (Object.keys(DEFAULT_HAPTIC_DURATIONS) as HapticStyle[]).forEach(resetHapticDuration);
}

export function getVibrationPattern(style: HapticStyle): number | number[] {
  switch (style) {
    case "tap":
      return hapticTapDuration();
    case "page-turn":
      return hapticPageTurnDuration();
    case "snap":
      return hapticSnapDuration();
    case "confirm": {
      const pulse = hapticConfirmDuration();
      return [pulse, 40, pulse];
    }
  }
}

export function getHapticTotalDurationMs(style: HapticStyle): number {
  const pattern = getVibrationPattern(style);
  if (typeof pattern === "number") return pattern;
  return pattern.reduce((acc, curr) => acc + curr, 0);
}

/** Android HapticFeedbackConstants mappings for numeric intensity hints (H-04). */
const ANDROID_HAPTIC_CONSTANTS: Record<HapticStyle, number> = {
  tap: 3, // HapticFeedbackConstants.KEYBOARD_TAP
  snap: 6, // HapticFeedbackConstants.CONTEXT_CLICK
  confirm: 16, // HapticFeedbackConstants.CONFIRM
  "page-turn": 3, // HapticFeedbackConstants.CLOCK_TICK / KEYBOARD_TAP
};

function playHapticInternal(style: HapticStyle): void {
  const dur = getHapticDuration(style);
  const amp = getHapticAmplitude();

  // 1. Android native bridge (uses native Android HapticFeedback engine / VibratorManager)
  if (typeof window !== "undefined" && window.AndroidThemeBridge) {
    const bridge = window.AndroidThemeBridge;
    if (typeof bridge.triggerHapticAdvanced === "function") {
      try {
        bridge.triggerHapticAdvanced(style, dur, amp);
        return; // Early return to prevent double vibration
      } catch (err) {
        log.debug("haptics", "AndroidThemeBridge.triggerHapticAdvanced failed:", err);
      }
    }
    if (typeof bridge.triggerHapticConstant === "function") {
      try {
        bridge.triggerHapticConstant(ANDROID_HAPTIC_CONSTANTS[style] ?? 3);
        return; // Early return
      } catch (err) {
        log.debug("haptics", "AndroidThemeBridge.triggerHapticConstant failed:", err);
      }
    }
    if (typeof bridge.triggerHaptic === "function") {
      try {
        bridge.triggerHaptic(style);
        return; // Early return
      } catch (err) {
        log.debug("haptics", "AndroidThemeBridge.triggerHaptic failed:", err);
      }
    }
  }

  // 2. Web navigator.vibrate fallback
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      const pattern = getVibrationPattern(style);
      navigator.vibrate(pattern);
    } catch (err) {
      log.debug("haptics", "navigator.vibrate failed:", err);
    }
  }
}

export function triggerHaptic(style: HapticStyle = "snap"): void {
  if (!isHapticsEnabled()) return;
  if (style === "page-turn" && !isPageTurnHapticsEnabled()) return;
  if ((style === "snap" || style === "confirm") && !isOverscrollHapticsEnabled()) return;
  playHapticInternal(style);
}

/** Plays a haptic preview directly for testing, bypassing toggle guards. */
export function previewHaptic(style: HapticStyle): void {
  playHapticInternal(style);
}

/** Detects active haptic hardware/API driver on current environment. */
export function getHapticsEngineStatus(): "android-bridge" | "web-vibration" | "unsupported" {
  if (typeof window !== "undefined" && window.AndroidThemeBridge?.triggerHaptic) {
    return "android-bridge";
  }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    return "web-vibration";
  }
  return "unsupported";
}
