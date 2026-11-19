import {
  BatchMetrics,
  ExecutionRecord,
  ModelMetrics,
  OverallMetrics,
  CURRENT_SCHEMA_VERSION,
} from "./types";
import { listExecutions, saveMetrics, getMetrics } from "./batches";

/** Compute percentile (linear interpolation between closest ranks). */
function percentile(sortedAsc: number[], p: number): number | undefined {
  if (sortedAsc.length === 0) return undefined;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

function median(sortedAsc: number[]): number | undefined {
  return percentile(sortedAsc, 50);
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * A completed execution that produced nothing: no content and no token usage.
 *
 * These reach `completed` when a provider answers without a usable body. They
 * must stay out of the averages — a missing cost is not a cost of zero, and
 * dividing by them understates cost/tokens for the model that misbehaved.
 */
export function isEmptyResult(e: ExecutionRecord): boolean {
  return (
    e.status === "completed" &&
    !e.response?.trim() &&
    !e.usage?.totalTokens &&
    !e.usage?.completionTokens
  );
}

/** Pick a numeric field, dropping entries where it is absent or not finite. */
function known(execs: ExecutionRecord[], pick: (e: ExecutionRecord) => number | undefined): number[] {
  const out: number[] = [];
  for (const e of execs) {
    const v = pick(e);
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Compute per-model metrics from a list of executions. */
export function computeModelMetrics(
  modelId: string,
  executions: ExecutionRecord[]
): ModelMetrics {
  const modelExecs = executions.filter((e) => e.modelId === modelId);
  const completed = modelExecs.filter((e) => e.status === "completed");
  const failed = modelExecs.filter((e) => e.status === "failed").length;
  const pending = modelExecs.filter(
    (e) => e.status === "pending" || e.status === "queued"
  ).length;
  const running = modelExecs.filter((e) => e.status === "running").length;
  const modelLabel = modelExecs[0]?.modelLabel;

  // Only executions that actually produced a result feed the averages.
  const empties = completed.filter(isEmptyResult);
  const usable = completed.filter((e) => !isEmptyResult(e));

  const latencies = known(usable, (e) => e.durationMs)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  const costs = known(usable, (e) => e.cost);
  const promptTokenSamples = known(usable, (e) => e.usage.promptTokens);
  const completionTokenSamples = known(usable, (e) => e.usage.completionTokens);
  const totalTokenSamples = known(usable, (e) => e.usage.totalTokens);

  const sum = (nums: number[]) => nums.reduce((a, b) => a + b, 0);
  const promptTokens = sum(promptTokenSamples);
  const completionTokens = sum(completionTokenSamples);
  const totalTokens = sum(totalTokenSamples);
  const totalCost = sum(costs);

  return {
    modelId,
    modelLabel,
    total: modelExecs.length,
    completed: completed.length,
    failed,
    pending,
    running,
    successRate: modelExecs.length > 0 ? completed.length / modelExecs.length : 0,
    totalCost,
    avgCost: avg(costs),
    minCost: costs.length ? Math.min(...costs) : undefined,
    maxCost: costs.length ? Math.max(...costs) : undefined,
    avgLatencyMs: avg(latencies),
    minLatencyMs: latencies.length ? latencies[0] : undefined,
    maxLatencyMs: latencies.length ? latencies[latencies.length - 1] : undefined,
    medianLatencyMs: median(latencies),
    p95LatencyMs: percentile(latencies, 95),
    latencies,
    totalPromptTokens: promptTokens,
    totalCompletionTokens: completionTokens,
    totalTokens,
    avgPromptTokens: avg(promptTokenSamples),
    avgCompletionTokens: avg(completionTokenSamples),
    avgTotalTokens: avg(totalTokenSamples),
    costPer1kTokens: totalTokens > 0 ? (totalCost / totalTokens) * 1000 : undefined,
    emptyResponses: empties.length,
    costSamples: costs.length,
    latencySamples: latencies.length,
    tokenSamples: totalTokenSamples.length,
  };
}

export function computeOverall(executions: ExecutionRecord[]): OverallMetrics {
  const completed = executions.filter((e) => e.status === "completed");
  const failed = executions.filter((e) => e.status === "failed").length;
  const pending = executions.filter(
    (e) => e.status === "pending" || e.status === "queued"
  ).length;
  const running = executions.filter((e) => e.status === "running").length;
  // Same rule as per-model: executions that produced nothing don't average.
  const empties = completed.filter(isEmptyResult);
  const usable = completed.filter((e) => !isEmptyResult(e));

  const costs = known(usable, (e) => e.cost);
  const latencies = known(usable, (e) => e.durationMs).filter((d) => d > 0);
  const sum = (nums: number[]) => nums.reduce((a, b) => a + b, 0);
  const promptTokens = sum(known(usable, (e) => e.usage.promptTokens));
  const completionTokens = sum(known(usable, (e) => e.usage.completionTokens));
  const totalTokens = sum(known(usable, (e) => e.usage.totalTokens));

  return {
    total: executions.length,
    completed: completed.length,
    failed,
    pending,
    running,
    successRate: executions.length > 0 ? completed.length / executions.length : 0,
    totalCost: sum(costs),
    avgCost: avg(costs),
    avgLatencyMs: avg(latencies),
    totalPromptTokens: promptTokens,
    totalCompletionTokens: completionTokens,
    totalTokens,
    emptyResponses: empties.length,
    costSamples: costs.length,
    latencySamples: latencies.length,
  };
}

/** Recompute and persist metrics for a batch. Returns the fresh metrics. */
export async function recomputeMetrics(batchId: string): Promise<BatchMetrics | undefined> {
  const executions = await listExecutions(batchId);
  const modelIds = Array.from(new Set(executions.map((e) => e.modelId)));
  const perModel = modelIds.map((id) => computeModelMetrics(id, executions));
  const overall = computeOverall(executions);
  const metrics: BatchMetrics = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    batchId,
    perModel,
    overall,
    computedAt: new Date().toISOString(),
  };
  await saveMetrics(metrics);
  return metrics;
}

/** Get cached metrics or recompute if missing. */
export async function getOrComputeMetrics(batchId: string): Promise<BatchMetrics | undefined> {
  const cached = await getMetrics(batchId);
  // Always recompute to reflect latest executions (cheap for reasonable sizes).
  return recomputeMetrics(batchId);
}
