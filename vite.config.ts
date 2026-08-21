import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  clearScreen: false,
  plugins: [solid()],
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**", "**/.data/**", "**/.rust/**", "**/target/**"],
    },
  },
  build: {
    target: "es2020",
    outDir: "dist",
    sourcemap: false,
  },
});
