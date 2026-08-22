import { createSignal, type Accessor } from "solid-js";

const [isMobileSignal, setIsMobileSignal] = createSignal<boolean>(
  typeof window !== "undefined"
    ? window.matchMedia("(max-width: 600px)").matches
    : false
);

if (typeof window !== "undefined") {
  const mq = window.matchMedia("(max-width: 600px)");
  const update = (e: MediaQueryListEvent | MediaQueryList) => {
    setIsMobileSignal(e.matches);
  };
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", update);
  } else {
    // Legacy MediaQueryList compatibility
    (mq as any).addListener(update);
  }
}

export const isMobile: Accessor<boolean> = isMobileSignal;
