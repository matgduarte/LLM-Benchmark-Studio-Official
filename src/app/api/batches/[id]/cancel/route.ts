import { NextRequest } from "next/server";
import { cancelBatch } from "@/lib/runner/manager";
import { apiHandler, json } from "@/lib/api/handlers";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const res = await cancelBatch(id);
  return json({ ok: true, ...res });
});
