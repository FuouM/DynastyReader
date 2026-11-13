import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  // soulwindow/solid ships JSX source (`solid` export condition). Compile it for the server so the
  // node-env suites that reach a component (reader-session → ReaderActions) can import it; the
  // DOM output would call template() at import, which Solid's server build rejects.
  plugins: [solid({ ssr: true })],
  resolve: {
    // One Solid runtime: never the copy inside a linked soulwindow checkout.
    dedupe: ["solid-js", "solid-js/web", "solid-js/store"],
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
