/**
 * Host shim: implements `window.PluginHost` for the standalone app.
 *
 * The plugin code talks to Curator's host facade; here every surface it
 * touches is backed by the local Tauri backend instead:
 *   - `callService` → Tauri `invoke` against the commands in `src-tauri/src/commands/`,
 *     with the standard `{ <Method>Result: … }` envelope (errors become
 *     `{ Error: { message } }`, never a rejection).
 *   - `registerTab` → mounts the render result into `#app` immediately.
 *   - `convertFileSrc` → `@tauri-apps/api/core` asset-protocol URL.
 *   - `system.openUrl` → the `open_url` command (system default browser).
 *   - `context` → informational only; the plugin never reads it.
 *
 * Methods this plugin never calls (`ui.*`, `dialogs.*`, `tools.*`, …) are
 * stubbed to satisfy the ambient `PluginHostApi` surface.
 */

import { convertFileSrc as tauriConvertFileSrc, invoke } from "@tauri-apps/api/core";

/** Backend command name for each generic service method. */
const COMMAND_MAP: Record<string, string> = {
  HttpGet: "http_get",
  HttpDownload: "http_download",
  PluginDbQuery: "db_query",
  PluginDbExecute: "db_execute",
  FileExists: "file_exists",
  FileExistsBatch: "file_exists_batch",
  FileMove: "file_move",
  FileDelete: "file_delete",
  DirStat: "dir_stat",
  DirStatBatch: "dir_stat_batch",
  EphemeralConvertImages: "ephemeral_convert_images",
};

/** Result envelope key for each method (matches the Curator facade exactly). */
const RESULT_KEYS: Record<string, string> = {
  HttpGet: "HttpGetResult",
  HttpDownload: "HttpDownloadResult",
  PluginDbQuery: "PluginDbQueryResult",
  PluginDbExecute: "PluginDbExecuteResult",
  FileExists: "FileExistsResult",
  FileExistsBatch: "FileExistsBatchResult",
  FileMove: "FileMoveResult",
  FileDelete: "FileDeleteResult",
  DirStat: "DirStatResult",
  DirStatBatch: "DirStatBatchResult",
  EphemeralConvertImages: "ConvertImagesResult",
};

/**
 * Curator-facade param name → Tauri command arg name (Tauri camelCases Rust
 * snake_case args, and Curator's facade uses its own names like `db` and
 * `timeout_ms`). Keys not listed pass through unchanged.
 */
const ARG_RENAMES: Record<string, Record<string, string>> = {
  HttpGet: { timeout_ms: "timeoutMs", content_type: "contentType" },
  HttpDownload: { output_path: "outputPath", timeout_ms: "timeoutMs" },
  PluginDbQuery: { db: "dbName" },
  PluginDbExecute: { db: "dbName" },
  EphemeralConvertImages: { max_dimension: "maxDimension", max_bytes: "maxBytes" },
};

async function callService(
  method: string,
  params: Record<string, unknown>,
): Promise<{ [k: string]: unknown }> {
  const command = COMMAND_MAP[method];
  if (!command) {
    return { Error: { message: `unsupported service method: ${method}` } };
  }
  const renames = ARG_RENAMES[method] ?? {};
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    args[renames[key] ?? key] = value;
  }
  try {
    const result = await invoke<unknown>(command, args as never);
    return { [RESULT_KEYS[method]]: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { Error: { message } };
  }
}

const noop = async (): Promise<never> => {
  throw new Error("PluginHost method not available in standalone mode");
};

window.PluginHost = {
  context: {
    // The plugin never reads these; the backend resolves all paths against the
    // portable data root itself.
    pluginId: "dynasty-scans",
    pluginDir: "",
    workspaceRoot: "",
  },
  storage: {
    stat: noop,
    exists: noop,
    resolve: noop,
    readText: noop,
    writeText: noop,
    readBinary: noop,
    writeBinary: noop,
    getFileSize: noop,
    move: noop,
    delete: noop,
    list: noop,
  },
  db: {
    execute: noop,
    query: noop,
  },
  media: {
    getMetadata: noop,
    convertImages: noop,
    transform: noop,
    getProgress: noop,
  },
  network: {
    get: noop,
    download: noop,
  },
  dialogs: {
    pickFile: noop,
    pickDirectory: noop,
    saveFile: noop,
  },
  system: {
    revealInFolder: noop,
    openExternally: noop,
    openUrl: async (url: string): Promise<void> => {
      await invoke("open_url", { url });
    },
  },
  ui: {
    onDragDrop: (): void => {
      /* unused by this plugin */
    },
  },
  tools: {
    check: noop,
    setPath: noop,
    install: noop,
    getProgress: noop,
  },
  callService,
  registerTab: (
    _id: string,
    _label: string,
    _iconClass: string,
    render: () => HTMLElement,
  ): void => {
    const el = render();
    const app = document.getElementById("app");
    if (app) app.appendChild(el);
  },
  registerMetadataRenderer: (): void => {
    /* unused by this plugin */
  },
  registerToolbarButton: (): void => {
    /* unused by this plugin */
  },
  registerContextMenuItem: (): void => {
    /* unused by this plugin */
  },
  convertFileSrc: (filePath: string): string => tauriConvertFileSrc(filePath),
  closeImageViewer: (): void => {
    /* unused by this plugin */
  },
};

export {};
