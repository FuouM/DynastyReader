import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
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
