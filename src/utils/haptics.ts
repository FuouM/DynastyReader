/**
 * Cross-platform haptic feedback utility for DynastyReader.
 *
 * Calls native AndroidThemeBridge.triggerHaptic() when running on Android,
 * with graceful fallback to navigator.vibrate() in browser environments.
 */
export function triggerHaptic(style: "snap" | "confirm" | "tap" = "snap"): void {
  // 1. Android native bridge (uses native Android HapticFeedback engine / VibratorManager)
  if (typeof window !== "undefined" && (window as any).AndroidThemeBridge?.triggerHaptic) {
    try {
      (window as any).AndroidThemeBridge.triggerHaptic(style);
    } catch (err) {
      console.debug("[dynasty-reader/haptics] AndroidThemeBridge.triggerHaptic failed:", err);
    }
  }

  // 2. Web navigator.vibrate fallback
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      if (style === "confirm") {
        navigator.vibrate(45);
      } else if (style === "snap") {
        navigator.vibrate(30);
      } else {
        navigator.vibrate(15);
      }
    } catch (err) {
      console.debug("[dynasty-reader/haptics] navigator.vibrate failed:", err);
    }
  }
}
