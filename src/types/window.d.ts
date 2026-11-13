import type { Route } from "./routes";

declare global {
  interface AndroidThemeBridge {
    updateTheme?(isDark: boolean, color: string): void;
    openUrl?(url: string): boolean;
    isConnectionMetered?(): boolean;
    setStatusBarVisible?(visible: boolean): void;
    setStatusBarHidden?(hidden: boolean): void;
    triggerHaptic?(style: string): void;
    triggerHapticAdvanced?(style: string, durationMs: number, amplitude: number): void;
    triggerHapticConstant?(constant: number): void;
    hasVibrator?(): boolean;
    hasAmplitudeControl?(): boolean;
    getHapticsEngineStatus?(): string;
    isNightMode?(): boolean;
  }

  interface Window {
    AndroidThemeBridge?: AndroidThemeBridge;
    __NAVIGATE__?: (target: Route) => void;
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  }
}

export {};
