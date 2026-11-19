import { promises as fs } from "node:fs";
import path from "node:path";
import { listDirs, listFiles, readJson } from "./fs";
import { PATHS } from "./paths";
import {
  INPUT_PREVIEW_CHARS,
  type BatchMeta,
  type CrossBatchExecution,
  type ExecutionRecord,
  type ExecutionStatus,
  type ModelUsage,
  type SlimExecutionRecord,
} from "./types";

/**
 * Cross-batch execution index.
 *
 * Executions live under the batch that produced them, so answering "everywhere
 * model X ran" means visiting every execution file on disk. Those files carry
 * the full raw API payload (~100 KB each), which dominates both the read and
 * the parse. Two things keep the scan cheap:
 *
 *  - `raw` is dropped right after parsing, so what is held in memory is a small
 *    fraction of the file;
 *  - parsed records are memoized per file and revalidated by `(mtime, size)`,
 *    so a repeated scan only re-reads what actually changed.
 *
 * What goes over the wire is narrowed once more by `toCrossBatchExecution`.
 */

/** An indexed execution, still carrying every field except `raw`. */
export interface IndexedExecution extends SlimExecutionRecord {
  batchName: string;
  batchTags: string[];
  batchCreatedAt: string;
  inputLabel?: string;
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  exec: SlimExecutionRecord;
}

/**
 * Replaced (not mutated) on every scan, so executions and batches that were
 * deleted meanwhile drop out instead of accumulating forever.
 */
let cache = new Map<string, CacheEntry>();

function slim(rec: ExecutionRecord): SlimExecutionRecord {
  const { raw: _raw, ...rest } = rec;
  return rest;
}

/** Every execution on disk, enriched with the batch it belongs to. */
export async function scanAllExecutions(): Promise<IndexedExecution[]> {
  const batchIds = await listDirs(PATHS.batchesDir);
  const next = new Map<string, CacheEntry>();
  const out: IndexedExecution[] = [];

  for (const batchId of batchIds) {
    const meta = await readJson<BatchMeta>(PATHS.batchMeta(batchId));
    // No meta means a half-created or foreign directory — nothing to attribute
    // its executions to, so skip it rather than inventing a batch name.
    if (!meta) continue;
    const inputLabels = new Map(meta.inputs.map((i) => [i.id, i.label]));
    const dir = PATHS.executionsDir(batchId);

    for (const file of await listFiles(dir, ".json")) {
      const filePath = path.join(dir, file);
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        continue; // vanished between listing and stat
      }
      const cached = cache.get(filePath);
      let exec =
        cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size
          ? cached.exec
          : undefined;
      if (!exec) {
        const rec = await readJson<ExecutionRecord>(filePath);
        if (!rec) continue;
        exec = slim(rec);
      }
      next.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, exec });
      out.push({
        ...exec,
        batchName: meta.name,
        batchTags: meta.tags ?? [],
        batchCreatedAt: meta.createdAt,
        // Batches created without labels store `""` — treat that as absent so
        // the UI falls back to the input id instead of rendering nothing.
        inputLabel: inputLabels.get(exec.inputId) || undefined,
      });
    }
  }

  cache = next;
  return out;
}

/** Narrow an indexed execution to the shape the cross-batch listing ships. */
export function toCrossBatchExecution(e: IndexedExecution): CrossBatchExecution {
  return {
    id: e.id,
    batchId: e.batchId,
    batchName: e.batchName,
    batchTags: e.batchTags,
    batchCreatedAt: e.batchCreatedAt,
    modelId: e.modelId,
    modelLabel: e.modelLabel,
    inputId: e.inputId,
    inputLabel: e.inputLabel,
    inputFormat: e.inputFormat,
    inputPreview: e.inputContent.slice(0, INPUT_PREVIEW_CHARS),
    inputTruncated: e.inputContent.length > INPUT_PREVIEW_CHARS,
    repetition: e.repetition,
    status: e.status,
    startedAt: e.startedAt,
    finishedAt: e.finishedAt,
    durationMs: e.durationMs,
    response: e.response,
    finishReason: e.finishReason,
    errorMessage: e.errorMessage,
    errorCode: e.errorCode,
    usage: e.usage,
    cost: e.cost,
    resolvedModel: e.resolvedModel,
    generationId: e.generationId,
    createdAt: e.createdAt,
  };
}

/** Newest first, by start time and falling back to creation time. */
function byRecencyDesc(a: IndexedExecution, b: IndexedExecution): number {
  return (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt);
}

export interface ExecutionSearchFilters {
  /** Models to include. An empty list matches nothing (see the API route). */
  modelIds: string[];
  status?: ExecutionStatus;
  batchId?: string;
  /** Free text, matched case-insensitively against the fields below. */
  query?: string;
}

/**
 * Text search runs here rather than in the browser because it looks at the full
 * input — which the listing itself only carries a preview of.
 */
function matchesQuery(e: IndexedExecution, needle: string): boolean {
  return (
    e.response?.toLowerCase().includes(needle) === true ||
    e.errorMessage?.toLowerCase().includes(needle) === true ||
    e.inputContent.toLowerCase().includes(needle) ||
    e.batchName.toLowerCase().includes(needle) ||
    (e.inputLabel ?? "").toLowerCase().includes(needle)
  );
}

/** Executions of the given models across every batch, newest first. */
export async function searchExecutionsByModel(
  filters: ExecutionSearchFilters
): Promise<IndexedExecution[]> {
  if (filters.modelIds.length === 0) return [];
  const wanted = new Set(filters.modelIds);
  const needle = filters.query?.trim().toLowerCase();
  const all = await scanAllExecutions();
  return all
    .filter((e) => wanted.has(e.modelId))
    .filter((e) => (filters.status ? e.status === filters.status : true))
    .filter((e) => (filters.batchId ? e.batchId === filters.batchId : true))
    .filter((e) => (needle ? matchesQuery(e, needle) : true))
    .sort(byRecencyDesc);
}

export interface ModelUsageReport {
  models: ModelUsage[];
  /** Executions considered, across every batch. */
  totalExecutions: number;
  /** Batches that hold at least one execution. */
  totalBatches: number;
}

/**
 * Which models have executions on disk, and how many. This is what populates
 * the model picker — a model configured in a batch that never ran has nothing
 * to show, so only models with at least one execution appear.
 */
export async function getModelUsage(): Promise<ModelUsageReport> {
  const all = await scanAllExecutions();
  const byModel = new Map<string, ModelUsage & { batchIds: Set<string> }>();
  const batchIds = new Set<string>();

  for (const e of all) {
    batchIds.add(e.batchId);
    let entry = byModel.get(e.modelId);
    if (!entry) {
      entry = {
        modelId: e.modelId,
        modelLabel: e.modelLabel,
        executions: 0,
        completed: 0,
        failed: 0,
        batches: 0,
        batchIds: new Set<string>(),
      };
      byModel.set(e.modelId, entry);
    }
    entry.modelLabel ??= e.modelLabel;
    entry.executions += 1;
    if (e.status === "completed") entry.completed += 1;
    if (e.status === "failed") entry.failed += 1;
    entry.batchIds.add(e.batchId);
    const ran = e.startedAt ?? e.createdAt;
    if (!entry.lastRunAt || ran > entry.lastRunAt) entry.lastRunAt = ran;
  }

  const models = [...byModel.values()]
    .map(({ batchIds: ids, ...m }) => ({ ...m, batches: ids.size }))
    .sort((a, b) => b.executions - a.executions || a.modelId.localeCompare(b.modelId));

  return { models, totalExecutions: all.length, totalBatches: batchIds.size };
}
