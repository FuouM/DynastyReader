import { createSignal, type Accessor } from "solid-js";

const MOBILE_MEDIA_QUERY = "(max-width: 680px)";

const [isMobileSignal, setIsMobileSignal] = createSignal<boolean>(
  typeof window !== "undefined"
    ? window.matchMedia(MOBILE_MEDIA_QUERY).matches
    : false
);

if (typeof window !== "undefined") {
  const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
  const update = (e: MediaQueryListEvent | MediaQueryList) => {
    setIsMobileSignal(e.matches);
  };
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", update);
  }
}

export const isMobile: Accessor<boolean> = isMobileSignal;
