import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  plugins: [
    solid(),
    {
      name: "tauri-mock-bridge-injector",
      transformIndexHtml(html, ctx) {
        if (ctx.originalUrl?.includes("mock=1") || process.env.VITE_TEST_MOCK === "1") {
          return html.replace(
            '<script type="module" src="/src/main.tsx"></script>',
            '<script src="/mock-bridge.js"></script>\n    <script type="module" src="/src/main.tsx"></script>',
          );
        }
        return html;
      },
    },
  ],
  server: {
    host: host || "localhost",
    port: 1420,
    strictPort: true,
    proxy: {
      "/api-proxy/dynasty": {
        target: "https://dynasty-scans.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy\/dynasty/, ""),
        headers: {
          "User-Agent": "Mozilla/5.0 DynastyReader/1.0",
        },
      },
      "/api-proxy/mangadex": {
        target: "https://api.mangadex.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy\/mangadex/, ""),
        headers: {
          "User-Agent": "Mozilla/5.0 DynastyReader/1.0",
        },
      },
    },
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
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["solid-js", "solid-js/web"],
          tauri: ["@tauri-apps/api", "@tauri-apps/plugin-dialog", "@tauri-apps/plugin-log", "@tauri-apps/plugin-window-state"],
        },
      },
    },
  },
});
