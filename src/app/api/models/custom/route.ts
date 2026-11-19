import { NextRequest, NextResponse } from "next/server";
import { upsertCustomModel, removeCustomModel } from "@/lib/storage/models";
import { apiHandler, bad } from "@/lib/api/handlers";

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  if (!body?.id || !body?.name) {
    return bad("`id` and `name` are required for a custom model.");
  }
  const model = await upsertCustomModel({
    id: body.id,
    name: body.name,
    description: body.description,
    contextLength: body.contextLength,
    pricing: body.pricing,
    promptPricePer1M: body.promptPricePer1M ?? body.pricing?.prompt,
    completionPricePer1M: body.completionPricePer1M ?? body.pricing?.completion,
  });
  return NextResponse.json({ model });
});

export const DELETE = apiHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return bad("`id` query param is required.");
  await removeCustomModel(id);
  return NextResponse.json({ ok: true });
});
