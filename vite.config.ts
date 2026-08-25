import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  clearScreen: false,
  plugins: [solid()],
  server: {
    host: process.env.TAURI_DEV_HOST || "0.0.0.0",
    port: 1420,
    strictPort: true,
    hmr: {
      protocol: "ws",
      host: process.env.TAURI_DEV_HOST || "10.0.2.2",
      port: 1420,
    },
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
