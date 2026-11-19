import { NextRequest, NextResponse } from "next/server";
import {
  getBatchMeta,
  getBatchStatus,
  deleteBatch,
  recomputeStatus,
} from "@/lib/storage/batches";
import { apiHandler, notFound, json } from "@/lib/api/handlers";
import { isBatchRunning } from "@/lib/runner/manager";

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const meta = await getBatchMeta(id);
  if (!meta) return notFound("Batch not found");
  const status = await recomputeStatus(id);
  return json({ meta, status: status ?? undefined, isRunning: isBatchRunning(id) });
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (isBatchRunning(id)) {
    return NextResponse.json(
      { error: "Cannot delete a running batch. Cancel it first.", code: "BATCH_RUNNING" },
      { status: 409 }
    );
  }
  await deleteBatch(id);
  return json({ ok: true });
});
