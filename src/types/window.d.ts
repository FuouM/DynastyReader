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

  interface DSColorBootstrapApi {
    PRESET_HEX_MAP: Record<string, string>;
    resolveAccentColorHex(color: string | null | undefined): string;
    parseHex(color: string): [number, number, number];
    toHex(r: number, g: number, b: number): string;
    /** Brightness factor in -1..1 (negative darkens, positive lightens). */
    adjustBrightnessFactor(hex: string, factor: number): string;
    rgbToHsl(r: number, g: number, b: number): [number, number, number];
    hslToRgb(h: number, s: number, l: number): [number, number, number];
    getContrastText(hex: string): string;
    getDeepAccentText(hex: string, targetLightness?: number, maxSaturation?: number): string;
    getAccessibleLinkColor(hex: string, isDark?: boolean): string;
  }

  interface Window {
    AndroidThemeBridge?: AndroidThemeBridge;
    DSColorBootstrap?: DSColorBootstrapApi;
    __NAVIGATE__?: (target: Route) => void;
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  }
}

export {};
