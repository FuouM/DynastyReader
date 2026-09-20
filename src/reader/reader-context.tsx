/**
 * SolidJS context provider for ReaderSession.
 * Eliminates 4 tiers of prop-drilling across the reader subcomponent tree.
 */

import { createContext, useContext, type JSX } from "solid-js";
import type { ReaderSession } from "./reader-session";

const ReaderContext = createContext<ReaderSession>();

export function ReaderProvider(props: { session: ReaderSession; children: JSX.Element }) {
  return <ReaderContext.Provider value={props.session}>{props.children}</ReaderContext.Provider>;
}

export function useReader(sessionOverride?: ReaderSession): ReaderSession {
  if (sessionOverride) return sessionOverride;
  const ctx = useContext(ReaderContext);
  if (!ctx) {
    throw new Error("useReader must be used within a <ReaderProvider>");
  }
  return ctx;
}
