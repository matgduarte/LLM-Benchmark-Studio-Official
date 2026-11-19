import { NextRequest } from "next/server";
import {
  searchExecutionsByModel,
  toCrossBatchExecution,
} from "@/lib/storage/executions-index";
import { computeModelMetrics, computeOverall } from "@/lib/storage/metrics";
import { apiHandler, json } from "@/lib/api/handlers";
import type { ExecutionStatus } from "@/lib/storage/types";

/**
 * Cross-batch execution search: every execution of the requested models, from
 * every batch on disk.
 *
 * Query params:
 *   `model`   — repeatable; model ids to include. Required: with none given the
 *               result is empty, since "the chosen models" is the whole point of
 *               this endpoint (use `/api/batches/<id>/executions` for a batch).
 *   `status`  — optional execution status filter.
 *   `batchId` — optional single-batch filter.
 *   `q`       — optional free text over response, error, input, batch name and
 *               input label. Matched against the *full* input, which the
 *               response itself only previews.
 *
 * Aggregates are computed over the same filtered set and follow the exact rules
 * used in the batch dashboards (empty results stay out of the averages).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const modelIds = [
    ...new Set(
      url.searchParams
        .getAll("model")
        .map((m) => m.trim())
        .filter(Boolean)
    ),
  ];
  const status = (url.searchParams.get("status") as ExecutionStatus | null) ?? undefined;
  const batchId = url.searchParams.get("batchId") ?? undefined;
  const query = url.searchParams.get("q") ?? undefined;

  const matches = await searchExecutionsByModel({ modelIds, status, batchId, query });

  // One entry per requested model, so a model with no match under the current
  // filters is reported as zeroed rather than silently missing.
  const perModel = modelIds.map((id) => computeModelMetrics(id, matches));

  return json({
    executions: matches.map(toCrossBatchExecution),
    perModel,
    overall: computeOverall(matches),
  });
});
