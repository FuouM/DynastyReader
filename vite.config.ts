import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  plugins: [solid()],
  server: {
    host: host || "0.0.0.0",
    port: 1420,
    strictPort: true,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1420,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**", "**/.data/**", "**/.rust/**", "**/target/**"],
    },
  },
  build: {
    target: "es2020",
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["solid-js", "solid-js/web"],
        },
      },
    },
  },
});
