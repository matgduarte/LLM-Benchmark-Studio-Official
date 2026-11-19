import { randomUUID } from "node:crypto";
import {
  BatchMeta,
  BatchStatus,
  ExecutionRecord,
  CURRENT_SCHEMA_VERSION,
} from "@/lib/storage/types";
import {
  createBatch as createBatchRepo,
  getBatchMeta,
  getBatchStatus,
  getExecution,
  saveBatchStatus,
  upsertIndex,
  saveExecution,
  listExecutions,
} from "@/lib/storage/batches";
import { getSettings, resolveApiKey } from "@/lib/storage/settings";
import {
  chatCompletion,
  OpenRouterError,
  estimateCost,
} from "@/lib/openrouter/client";
import { findModel } from "@/lib/storage/models";
import { recomputeMetrics } from "@/lib/storage/metrics";

/**
 * Execution runner — a module-level singleton that processes batch executions
 * concurrently with bounded parallelism.
 *
 * Key design points:
 * - Each execution is persisted to its own JSON file *immediately* after it
 *   finishes (success or failure), so partial progress survives crashes.
 * - Batch status counters are recomputed from disk on every transition to
 *   guarantee the on-disk truth matches what the runner believes.
 * - A per-batch concurrency limiter (semaphore) prevents flooding the
 *   OpenRouter API.
 * - The runner holds an in-memory set of active executions so cancellation
 *   can signal AbortControllers.
 * - On process restart, `running` executions on disk are reconciled to
 *   `interrupted` (see `recomputeStatus`); the user can re-run them.
 */

interface QueuedJob {
  batchId: string;
  execId: string;
  modelId: string;
  modelLabel?: string;
  inputId: string;
  inputFormat: "text" | "json";
  inputContent: string;
  systemPrompt: string;
  repetition: number;
  params: BatchMeta["params"];
  timeoutMs: number;
  abort: AbortController;
}

const activeBatches = new Set<string>();
const activeJobs = new Map<string, QueuedJob>(); // execId -> job

interface Slots {
  active: number;
  queue: Array<() => void>;
}
const batchSlots = new Map<string, Slots>();

/**
 * Acquire a slot for a batch, respecting its concurrency limit.
 *
 * The counter lives here (not derived from `activeJobs`) because callers only
 * register themselves in `activeJobs` *after* awaiting this function. Deriving
 * the count from that map let every job dispatched in the same synchronous
 * loop observe `active === 0` and skip the queue entirely, so the limit was
 * silently ignored.
 */
function acquire(batchId: string, concurrency: number): Promise<void> {
  const limit = Math.max(1, concurrency);
  let slots = batchSlots.get(batchId);
  if (!slots) {
    slots = { active: 0, queue: [] };
    batchSlots.set(batchId, slots);
  }
  if (slots.active < limit) {
    slots.active++;
    return Promise.resolve();
  }
  const waiting = slots;
  return new Promise<void>((resolve) => {
    waiting.queue.push(() => {
      waiting.active++;
      resolve();
    });
  });
}

function release(batchId: string) {
  const slots = batchSlots.get(batchId);
  if (!slots) return;
  slots.active = Math.max(0, slots.active - 1);
  const next = slots.queue.shift();
  if (next) next();
}

/**
 * Wake every waiter without running work (used on cancel), so pending
 * `dispatch` calls resolve and unwind instead of leaking forever.
 */
function drainSlots(batchId: string) {
  const slots = batchSlots.get(batchId);
  batchSlots.delete(batchId);
  if (!slots) return;
  for (const wake of slots.queue.splice(0)) wake();
}

function activeJobsCountFor(batchId: string): number {
  let n = 0;
  for (const job of activeJobs.values()) if (job.batchId === batchId) n++;
  return n;
}

/** Build the full execution plan (model x input x repetition) for a batch. */
function buildPlan(meta: BatchMeta): Array<Omit<QueuedJob, "abort" | "batchId">> {
  const jobs: Array<Omit<QueuedJob, "abort" | "batchId">> = [];
  for (const model of meta.models) {
    for (const input of meta.inputs) {
      for (let r = 1; r <= meta.repetitions; r++) {
        jobs.push({
          execId: randomUUID(),
          modelId: model.id,
          modelLabel: model.label,
          inputId: input.id,
          inputFormat: input.format,
          inputContent: input.content,
          systemPrompt: meta.systemPrompt,
          repetition: r,
          params: meta.params,
          timeoutMs: meta.timeoutMs,
        });
      }
    }
  }
  return jobs;
}

/** Persist the initial `pending` execution records before running. */
async function persistPendingExecutions(meta: BatchMeta): Promise<void> {
  const plan = buildPlan(meta);
  const now = new Date().toISOString();
  for (const j of plan) {
    const rec: ExecutionRecord = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: j.execId,
      batchId: meta.id,
      modelId: j.modelId,
      modelLabel: j.modelLabel,
      inputId: j.inputId,
      inputFormat: j.inputFormat,
      inputContent: j.inputContent,
      systemPrompt: j.systemPrompt,
      repetition: j.repetition,
      params: j.params,
      status: "pending",
      usage: {},
      createdAt: now,
      updatedAt: now,
    };
    await saveExecution(rec);
  }
}

/** Update a single execution's status & persist it. */
async function updateExecution(
  execId: string,
  batchId: string,
  patch: Partial<ExecutionRecord>
): Promise<void> {
  const cur = await getExecution(batchId, execId);
  if (!cur) return;
  const next: ExecutionRecord = {
    ...cur,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await saveExecution(next);
}

/** Run a single execution: call OpenRouter, parse result, persist. */
async function runJob(job: QueuedJob): Promise<void> {
  const settings = await getSettings();
  const apiKey = resolveApiKey(settings);
  if (!apiKey) {
    await updateExecution(job.execId, job.batchId, {
      status: "failed",
      errorMessage: "OpenRouter API key is not configured. Add it in Settings.",
      errorCode: "NO_API_KEY",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
    await refreshBatchStatus(job.batchId);
    return;
  }

  const startedAt = new Date().toISOString();
  await updateExecution(job.execId, job.batchId, {
    status: "running",
    startedAt,
  });
  await refreshBatchStatus(job.batchId);

  const model = await findModel(job.modelId);
  try {
    const result = await chatCompletion(
      {
        apiKey,
        model: job.modelId,
        messages: [
          ...(job.systemPrompt ? [{ role: "system" as const, content: job.systemPrompt }] : []),
          { role: "user" as const, content: job.inputContent },
        ],
        temperature: job.params.temperature,
        maxTokens: job.params.maxTokens,
        topP: job.params.topP,
        // Forward structured-output config + require_parameters flag so the
        // benchmark can probe which models actually support JSON schema.
        responseFormat: job.params.responseFormat,
        requireParameters: job.params.requireParameters,
        referer: settings.referer,
        appTitle: settings.appTitle,
        signal: job.abort.signal,
      },
      settings.maxRetries,
      settings.retryBackoffMs
    );

    const cost =
      result.cost ??
      estimateCost(
        {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
        },
        model?.promptPricePer1M,
        model?.completionPricePer1M
      );

    await updateExecution(job.execId, job.batchId, {
      status: "completed",
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - new Date(startedAt).getTime(),
      response: result.content,
      finishReason: result.finishReason,
      usage: result.usage,
      cost,
      resolvedModel: result.resolvedModel,
      generationId: result.generationId,
      raw: result.raw,
      errorMessage: undefined,
      errorCode: undefined,
    });
  } catch (err: unknown) {
    const isAbort =
      err instanceof OpenRouterError && err.code === "TIMEOUT";
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof OpenRouterError ? err.code : "UNKNOWN";
    await updateExecution(job.execId, job.batchId, {
      status: isAbort ? "interrupted" : "failed",
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - new Date(startedAt).getTime(),
      errorMessage: message,
      errorCode: code,
      raw: err instanceof OpenRouterError ? err.body : undefined,
    });
  } finally {
    await refreshBatchStatus(job.batchId);
    // Recompute metrics so dashboard reflects latest.
    await recomputeMetrics(job.batchId).catch(() => undefined);
  }
}

/** Refresh a batch's on-disk status from executions + runner state. */
async function refreshBatchStatus(batchId: string): Promise<void> {
  const meta = await getBatchMeta(batchId);
  if (!meta) return;
  const executions = await listExecutions(batchId);
  const counts = {
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
  const prev = await getBatchStatus(batchId);
  const allDone =
    counts.completed + counts.failed + counts.cancelled + counts.interrupted ===
    executions.length;
  const status: BatchStatus = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    batchId,
    total: executions.length || meta.inputs.length * meta.models.length * meta.repetitions,
    ...counts,
    startedAt: startedAt ?? prev?.startedAt,
    finishedAt: allDone ? finishedAt ?? prev?.finishedAt : undefined,
    lastUpdatedAt: new Date().toISOString(),
    isRunning: activeBatches.has(batchId),
  };
  await saveBatchStatus(status);
  await upsertIndex(meta, status);
}

/** Start running a batch. Persists pending executions then dispatches. */
export async function startBatch(batchId: string): Promise<{ queued: number }> {
  if (activeBatches.has(batchId)) {
    // Already running — re-join to existing flow.
    return { queued: 0 };
  }
  const meta = await getBatchMeta(batchId);
  if (!meta) throw new Error(`Batch ${batchId} not found`);

  // Mark batch running.
  activeBatches.add(batchId);
  const status = await getBatchStatus(batchId);
  if (status) {
    status.isRunning = true;
    status.startedAt = status.startedAt ?? new Date().toISOString();
    status.lastUpdatedAt = new Date().toISOString();
    await saveBatchStatus(status);
    await upsertIndex(meta, status);
  }

  // Persist pending execution files if none exist yet (first run).
  const existing = await listExecutions(batchId);
  const pendingExecs = existing.filter(
    (e) => e.status === "pending" || e.status === "queued" || e.status === "interrupted" || e.status === "running"
  );
  if (existing.length === 0) {
    await persistPendingExecutions(meta);
  } else {
    // Reconcile interrupted/running -> reset to queued for re-run.
    for (const e of pendingExecs) {
      if (e.status === "running" || e.status === "interrupted") {
        await updateExecution(e.id, batchId, {
          status: "queued",
          errorMessage: undefined,
          errorCode: undefined,
        });
      }
    }
  }

  const plan = await listExecutions(batchId);
  const toRun = plan.filter(
    (e) => e.status === "pending" || e.status === "queued"
  );

  // Dispatch all pending/queued jobs (fire-and-forget, bounded by semaphore).
  for (const e of toRun) {
    void dispatch(meta, e);
  }

  return { queued: toRun.length };
}

async function dispatch(meta: BatchMeta, exec: ExecutionRecord): Promise<void> {
  await acquire(meta.id, meta.concurrency);
  // The batch may have been cancelled while this job sat in the queue.
  if (!activeBatches.has(meta.id)) {
    release(meta.id);
    return;
  }
  const job: QueuedJob = {
    batchId: meta.id,
    execId: exec.id,
    modelId: exec.modelId,
    modelLabel: exec.modelLabel,
    inputId: exec.inputId,
    inputFormat: exec.inputFormat,
    inputContent: exec.inputContent,
    systemPrompt: exec.systemPrompt,
    repetition: exec.repetition,
    params: exec.params,
    timeoutMs: meta.timeoutMs,
    abort: new AbortController(),
  };
  activeJobs.set(exec.id, job);

  // Timeout enforcement (AbortController + setTimeout).
  const timer = setTimeout(() => job.abort.abort(), job.timeoutMs);

  try {
    await runJob(job);
  } finally {
    clearTimeout(timer);
    activeJobs.delete(exec.id);
    release(meta.id);
    // If no more active jobs for this batch, finalize.
    if (activeJobsCountFor(meta.id) === 0 && activeBatches.has(meta.id)) {
      // Only mark not-running if there are no pending/queued left.
      const remaining = await listExecutions(meta.id);
      const hasPending = remaining.some(
        (e) => e.status === "pending" || e.status === "queued"
      );
      if (!hasPending) {
        activeBatches.delete(meta.id);
        batchSlots.delete(meta.id);
        await refreshBatchStatus(meta.id);
      }
    }
  }
}

/** Cancel all in-flight executions for a batch. */
export async function cancelBatch(batchId: string): Promise<{ cancelled: number }> {
  let n = 0;
  for (const [execId, job] of Array.from(activeJobs.entries())) {
    if (job.batchId === batchId) {
      job.abort.abort();
      activeJobs.delete(execId);
      n++;
      // Mark as cancelled on disk.
      await updateExecution(execId, batchId, {
        status: "cancelled",
        finishedAt: new Date().toISOString(),
        errorMessage: "Cancelled by user",
        errorCode: "CANCELLED",
      }).catch(() => undefined);
    }
  }
  activeBatches.delete(batchId);
  // Wake queued dispatches so they unwind (they re-check `activeBatches`).
  drainSlots(batchId);
  // Mark any pending/queued on disk as cancelled.
  const execs = await listExecutions(batchId);
  for (const e of execs) {
    if (e.status === "pending" || e.status === "queued") {
      await updateExecution(e.id, batchId, {
        status: "cancelled",
        finishedAt: new Date().toISOString(),
        errorMessage: "Cancelled by user",
        errorCode: "CANCELLED",
      });
    }
  }
  await refreshBatchStatus(batchId);
  return { cancelled: n };
}

/** Is a batch currently being processed? */
export function isBatchRunning(batchId: string): boolean {
  return activeBatches.has(batchId);
}

/** Re-export createBatch for API layer convenience. */
export { createBatchRepo as createBatch };
