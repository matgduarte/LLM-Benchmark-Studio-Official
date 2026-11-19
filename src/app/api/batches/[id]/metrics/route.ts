import { NextRequest } from "next/server";
import { getOrComputeMetrics } from "@/lib/storage/metrics";
import { apiHandler, json } from "@/lib/api/handlers";

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const metrics = await getOrComputeMetrics(id);
  return json({ metrics });
});
