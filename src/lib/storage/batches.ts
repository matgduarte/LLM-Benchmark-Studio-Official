import path from "node:path";
import {
  BatchMeta,
  BatchStatus,
  BatchIndexEntry,
  ExecutionRecord,
  ExecutionStatus,
  BatchMetrics,
  CURRENT_SCHEMA_VERSION,
} from "./types";
import {
  readJson,
  writeJsonAtomic,
  updateJsonAtomic,
  ensureDir,
  listFiles,
  removeDir,
} from "./fs";
import { PATHS } from "./paths";

/** Create the immutable batch meta + initial status + index entry. */
export async function createBatch(
  meta: Omit<BatchMeta, "schemaVersion" | "createdAt">
): Promise<{ meta: BatchMeta; status: BatchStatus }> {
  const now = new Date().toISOString();
  const fullMeta: BatchMeta = {
    ...meta,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: now,
  };
  const total = meta.inputs.length * meta.models.length * meta.repetitions;
  const status: BatchStatus = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    batchId: meta.id,
    total,
    pending: total,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    interrupted: 0,
    lastUpdatedAt: now,
    isRunning: false,
  };
  const batchDir = PATHS.batchDir(meta.id);
  await ensureDir(batchDir);
  await ensureDir(PATHS.executionsDir(meta.id));
  await writeJsonAtomic(PATHS.batchMeta(meta.id), fullMeta);
  await writeJsonAtomic(PATHS.batchStatus(meta.id), status);
  await upsertIndex(fullMeta, status);
  return { meta: fullMeta, status };
}

export async function getBatchMeta(batchId: string): Promise<BatchMeta | undefined> {
  return readJson<BatchMeta>(PATHS.batchMeta(batchId));
}

export async function getBatchStatus(batchId: string): Promise<BatchStatus | undefined> {
  return readJson<BatchStatus>(PATHS.batchStatus(batchId));
}

export async function saveBatchStatus(status: BatchStatus): Promise<void> {
  await writeJsonAtomic(PATHS.batchStatus(status.batchId), status);
}

/**
 * Recompute a batch's status from the executions on disk.
 * Useful after a process restart to reconcile in-flight (`running`) executions
 * that were interrupted.
 */
export async function recomputeStatus(batchId: string): Promise<BatchStatus | undefined> {
  const meta = await getBatchMeta(batchId);
  if (!meta) return undefined;
  const executions = await listExecutions(batchId);
  const counts: Record<ExecutionStatus, number> = {
    pending: 0,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    interrupted: 0,
  };
  let startedAt: string | undefined;
  let finishedAt: string | undefined;
  for (const e of executions) {
    counts[e.status] = (counts[e.status] ?? 0) + 1;
    if (e.startedAt && (!startedAt || e.startedAt < startedAt)) startedAt = e.startedAt;
    if (e.finishedAt && (!finishedAt || e.finishedAt > finishedAt)) finishedAt = e.finishedAt;
  }
  // pending = total - (all processed statuses) — derive from meta total
  const processed =
    counts.completed + counts.failed + counts.cancelled + counts.interrupted + counts.running + counts.queued;
  counts.pending = Math.max(0, meta.inputs.length * meta.models.length * meta.repetitions - processed);
  const prev = await getBatchStatus(batchId);
  const status: BatchStatus = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    batchId,
    total: meta.inputs.length * meta.models.length * meta.repetitions,
    ...counts,
    startedAt: startedAt ?? prev?.startedAt,
    finishedAt: finishedAt ?? prev?.finishedAt,
    lastUpdatedAt: new Date().toISOString(),
    isRunning: prev?.isRunning ?? false,
  };
  await saveBatchStatus(status);
  await upsertIndex(meta, status);
  return status;
}

export async function deleteBatch(batchId: string): Promise<void> {
  await removeDir(PATHS.batchDir(batchId));
  // Remove from index
  await updateJsonAtomic<BatchIndexEntry[]>(PATHS.batchesIndex, [], (idx) =>
    idx.filter((e) => e.id !== batchId)
  );
}

export async function upsertIndex(
  meta: BatchMeta,
  status: BatchStatus
): Promise<void> {
  const entry: BatchIndexEntry = {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    total: status.total,
    completed: status.completed,
    failed: status.failed,
    pending: status.pending,
    running: status.running,
    isRunning: status.isRunning,
    createdAt: meta.createdAt,
    lastUpdatedAt: status.lastUpdatedAt,
    tags: meta.tags,
    modelCount: meta.models.length,
    inputCount: meta.inputs.length,
    repetitions: meta.repetitions,
  };
  await updateJsonAtomic<BatchIndexEntry[]>(PATHS.batchesIndex, [], (idx) => {
    const next = [...idx];
    const i = next.findIndex((e) => e.id === entry.id);
    if (i >= 0) next[i] = entry;
    else next.unshift(entry); // newest first
    return next;
  });
}

export async function listBatchesIndex(): Promise<BatchIndexEntry[]> {
  return (await readJson<BatchIndexEntry[]>(PATHS.batchesIndex, [])) ?? [];
}

// ---- Executions ----

export async function saveExecution(exec: ExecutionRecord): Promise<void> {
  await writeJsonAtomic(PATHS.execution(exec.batchId, exec.id), exec);
}

export async function getExecution(
  batchId: string,
  execId: string
): Promise<ExecutionRecord | undefined> {
  return readJson<ExecutionRecord>(PATHS.execution(batchId, execId));
}

export async function listExecutions(batchId: string): Promise<ExecutionRecord[]> {
  const dir = PATHS.executionsDir(batchId);
  const files = await listFiles(dir, ".json");
  const records: ExecutionRecord[] = [];
  for (const f of files) {
    const rec = await readJson<ExecutionRecord>(path.join(dir, f));
    if (rec) records.push(rec);
  }
  return records;
}

export async function saveMetrics(metrics: BatchMetrics): Promise<void> {
  await writeJsonAtomic(PATHS.batchMetrics(metrics.batchId), metrics);
}

export async function getMetrics(batchId: string): Promise<BatchMetrics | undefined> {
  return readJson<BatchMetrics>(PATHS.batchMetrics(batchId));
}
