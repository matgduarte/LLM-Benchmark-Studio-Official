import { NextRequest } from "next/server";
import { listExecutions } from "@/lib/storage/batches";
import { apiHandler, notFound, json } from "@/lib/api/handlers";

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  // The execution id is unique per batch, but we don't know the batchId here.
  // Strategy: scan all batch dirs' index for any execution matching the id.
  // For simplicity & performance, expect `?batchId=` query param.
  const url = new URL(_req.url);
  const batchId = url.searchParams.get("batchId");
  if (!batchId) return notFound("Provide ?batchId= to locate the execution.");
  const all = await listExecutions(batchId);
  const exec = all.find((e) => e.id === id);
  if (!exec) return notFound("Execution not found");
  return json({ execution: exec });
});
