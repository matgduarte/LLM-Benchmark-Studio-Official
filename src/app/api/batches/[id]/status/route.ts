import { NextRequest } from "next/server";
import { getBatchStatus } from "@/lib/storage/batches";
import { apiHandler, json } from "@/lib/api/handlers";
import { isBatchRunning } from "@/lib/runner/manager";

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const status = await getBatchStatus(id);
  return json({ status, isRunning: isBatchRunning(id) });
});
