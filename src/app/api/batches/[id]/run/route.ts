import { NextRequest } from "next/server";
import { startBatch } from "@/lib/runner/manager";
import { apiHandler, notFound, json, bad } from "@/lib/api/handlers";
import { getBatchMeta } from "@/lib/storage/batches";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const meta = await getBatchMeta(id);
  if (!meta) return notFound("Batch not found");
  if (!meta.inputs.length || !meta.models.length) {
    return bad("Batch has no inputs or models configured.");
  }
  const res = await startBatch(id);
  return json({ ok: true, ...res });
});
