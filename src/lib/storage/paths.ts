import path from "node:path";

/**
 * Central path resolution for the file-based data store.
 *
 * Layout:
 *   <dataRoot>/
 *     config/settings.json         — app settings (API key, defaults)
 *     config/models.json           — cached OpenRouter model catalog
 *     config/custom-models.json    — user-registered models
 *     batches/index.json           — lightweight catalog of all batches
 *     batches/<batchId>/
 *       meta.json                  — immutable batch configuration
 *       status.json                — live progress counters
 *       metrics.json               — aggregated metrics (recomputed on demand)
 *       executions/<execId>.json   — one file per execution
 *
 * The data root defaults to `<projectRoot>/data` but can be overridden via
 * `LLM_BENCH_DATA_DIR` for tests or alternate deployments.
 */

const DATA_ROOT = process.env.LLM_BENCH_DATA_DIR
  ? path.resolve(process.env.LLM_BENCH_DATA_DIR)
  : path.resolve(process.cwd(), "data");

export const PATHS = {
  dataRoot: DATA_ROOT,
  configDir: path.join(DATA_ROOT, "config"),
  settings: path.join(DATA_ROOT, "config", "settings.json"),
  models: path.join(DATA_ROOT, "config", "models.json"),
  customModels: path.join(DATA_ROOT, "config", "custom-models.json"),
  batchesDir: path.join(DATA_ROOT, "batches"),
  batchesIndex: path.join(DATA_ROOT, "batches", "index.json"),
  batchDir: (batchId: string) => path.join(DATA_ROOT, "batches", batchId),
  executionsDir: (batchId: string) =>
    path.join(DATA_ROOT, "batches", batchId, "executions"),
  batchMeta: (batchId: string) =>
    path.join(DATA_ROOT, "batches", batchId, "meta.json"),
  batchStatus: (batchId: string) =>
    path.join(DATA_ROOT, "batches", batchId, "status.json"),
  batchMetrics: (batchId: string) =>
    path.join(DATA_ROOT, "batches", batchId, "metrics.json"),
  execution: (batchId: string, execId: string) =>
    path.join(DATA_ROOT, "batches", batchId, "executions", `${execId}.json`),
} as const;
