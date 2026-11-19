import { NextRequest } from "next/server";
import { listExecutions } from "@/lib/storage/batches";
import { apiHandler, json } from "@/lib/api/handlers";
import type { ExecutionStatus } from "@/lib/storage/types";

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const status = url.searchParams.get("status") as ExecutionStatus | null;
  const modelId = url.searchParams.get("modelId");
  let executions = await listExecutions(id);
  if (status) executions = executions.filter((e) => e.status === status);
  if (modelId) executions = executions.filter((e) => e.modelId === modelId);
  // Sort: by model, then input, then repetition for deterministic ordering.
  executions.sort((a, b) => {
    if (a.modelId !== b.modelId) return a.modelId.localeCompare(b.modelId);
    if (a.inputId !== b.inputId) return a.inputId.localeCompare(b.inputId);
    return a.repetition - b.repetition;
  });
  return json({ executions });
});
